import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../../chatgpt-auth';
import {followedRepo} from '@/lib/radar';
import {MAX_COVER_BYTES,validateCover} from '@/lib/cover-image';
export const dynamic='force-dynamic';
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
const storage=()=>{if(!env.DB||!env.BUCKET)throw new Error('El almacenamiento de portadas no está disponible.');return {db:env.DB,bucket:env.BUCKET};};

export async function GET(request:Request){
  const user=await getChatGPTUser();if(!user)return json({error:'Inicia sesión para ver tu portada.'},401);
  const repo=new URL(request.url).searchParams.get('repo')?.toLowerCase();if(!repo||repo.length>200)return json({error:'Juego inválido.'},400);
  try{
    const {db,bucket}=storage();
    const row=await db.prepare('SELECT object_key,mime FROM game_covers WHERE user_id=? AND repo=?').bind(user.userId,repo).first<{object_key:string;mime:string}>();
    if(!row)return json({error:'Sin portada.'},404);
    const object=await bucket.get(row.object_key);if(!object)return json({error:'Portada no disponible.'},404);
    return new Response(object.body,{headers:{'Content-Type':row.mime,'Content-Length':String(object.size),'Content-Disposition':'inline; filename="portada.'+(row.mime==='image/png'?'png':'jpg')+'"','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",'Cache-Control':'private, no-store'}});
  }catch{return json({error:'No se pudo abrir la portada.'},503);}
}
async function boundedForm(request:Request){
  const max=MAX_COVER_BYTES+64*1024;
  if(Number(request.headers.get('content-length'))>max)throw new Error('La portada debe pesar como máximo 2 MB.');
  const reader=request.body?.getReader();if(!reader)throw new Error('Selecciona una imagen.');
  const chunks:Uint8Array[]=[];let total=0;
  for(;;){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>max){await reader.cancel();throw new Error('La portada debe pesar como máximo 2 MB.');}chunks.push(value);}
  const bytes=new Uint8Array(total);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}
  return new Response(bytes,{headers:{'Content-Type':request.headers.get('content-type')??''}}).formData();
}
export async function POST(request:Request){
  let validInput=false;
  const user=await getChatGPTUser();if(!user)return json({error:'Inicia sesión para guardar una portada.'},401);
  const origin=request.headers.get('origin');if(origin&&new URL(origin).host!==request.headers.get('host'))return json({error:'Origen no permitido.'},403);
  try{
    const form=await boundedForm(request);const value=form.get('image');
    if(form.getAll('image').length!==1||form.getAll('repo').length!==1||!value||typeof value==='string')throw new Error('Selecciona una sola imagen.');
    const repo=(await followedRepo(user.userId,form.get('repo'))).toLowerCase();
    if(value.size>MAX_COVER_BYTES)throw new Error('La portada debe pesar como máximo 2 MB.');
    const bytes=new Uint8Array(await value.arrayBuffer());const {mime}=validateCover(bytes,value.type);validInput=true;
    const {db,bucket}=storage();
    const previous=await db.prepare('SELECT object_key FROM game_covers WHERE user_id=? AND repo=?').bind(user.userId,repo).first<{object_key:string}>();
    const key='covers/'+crypto.randomUUID();const updatedAt=new Date().toISOString();
    await bucket.put(key,bytes,{httpMetadata:{contentType:mime}});
    try{await db.prepare('INSERT INTO game_covers(user_id,repo,object_key,mime,bytes,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,repo) DO UPDATE SET object_key=excluded.object_key,mime=excluded.mime,bytes=excluded.bytes,updated_at=excluded.updated_at').bind(user.userId,repo,key,mime,bytes.length,updatedAt).run();}
    catch(e){await bucket.delete(key);throw e;}
    if(previous)await bucket.delete(previous.object_key);
    return json({ok:true,repo,updatedAt});
  }catch(e){return json({error:validInput?'No se pudo guardar la portada. Intenta de nuevo.':e instanceof Error?e.message:'Solicitud de portada inválida.'},validInput?503:400);}
}
export async function DELETE(request:Request){
  const user=await getChatGPTUser();if(!user)return json({error:'Inicia sesión para quitar una portada.'},401);
  const origin=request.headers.get('origin');if(origin&&new URL(origin).host!==request.headers.get('host'))return json({error:'Origen no permitido.'},403);
  try{
    const repo=(await followedRepo(user.userId,new URL(request.url).searchParams.get('repo'))).toLowerCase();
    const {db,bucket}=storage();
    const row=await db.prepare('SELECT object_key FROM game_covers WHERE user_id=? AND repo=?').bind(user.userId,repo).first<{object_key:string}>();
    if(row)await bucket.delete(row.object_key);
    await db.prepare('DELETE FROM game_covers WHERE user_id=? AND repo=?').bind(user.userId,repo).run();
    return json({ok:true});
  }catch(e){return json({error:e instanceof Error?e.message:'No se pudo quitar la portada.'},400);}
}
