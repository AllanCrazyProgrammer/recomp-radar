import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../../chatgpt-auth';
import {followedRepo} from '@/lib/radar';
import {github} from '@/lib/github';
import {loadRepositoryGuide} from '@/lib/guide-loader';
export const dynamic='force-dynamic';
const result=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(request:Request){
 const user=await getChatGPTUser();if(!user)return result({error:'Inicia sesión para consultar la guía.'},401);
 try{
  const db=env.DB;if(!db)return result({error:'La base de datos no está disponible.'},503);
  const params=new URL(request.url).searchParams,repo=await followedRepo(user.userId,params.get('repo'));
  const release=params.get('release');if(!release||release.length>400)return result({error:'Release inválida.'},400);
  // The caller cannot choose arbitrary GitHub refs or documentation URLs.
  const row=await db.prepare("SELECT release_tag FROM events WHERE id=? AND repo=? AND kind='release'").bind(release,repo).first<{release_tag:string|null}>();
  if(!row)return result({error:'Esta release no pertenece al proyecto.'},404);
  return result(await loadRepositoryGuide({db,github},repo,row.release_tag));
 }catch{return result({error:'No se pudo consultar la documentación de este proyecto.'},400);}
}
