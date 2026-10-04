import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../../chatgpt-auth';
import {boundedJson,PayloadError} from '@/lib/request-json';
import {refresh} from '@/lib/radar';
export const dynamic='force-dynamic';
const result=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store'}});
// Sites consumes its service token and does not turn it into a visitor identity.
// Unidentified calls may update only an explicitly configured account on this
// owner-private Site. Never infer an owner or synchronize all users as fallback.
function serviceOwner(){return (env as unknown as {BACKGROUND_OWNER_USER_ID?:string}).BACKGROUND_OWNER_USER_ID?.trim();}
export async function POST(request:Request){
 const user=await getChatGPTUser(),owner=serviceOwner();
 if(!user&&!owner)return result({error:'Configura explícitamente la cuenta de la tarea de fondo antes de ejecutarla.'},409);
 if(user){const origin=request.headers.get('origin');if(!origin||origin!==new URL(request.url).origin)return result({error:'Origen no permitido.'},403);}
 try{
  const parsed=await boundedJson(request,4096,true);if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))return result({error:'Solicitud inválida.'},400);const input=parsed as {schedule?:{id?:unknown;enabled?:unknown;cadence?:unknown}};
  if(input.schedule){
   if(!user||!owner||user.userId!==owner)return result({error:'Solo la cuenta configurada puede administrar la tarea.'},403);
   const value=input.schedule;if(typeof value.id!=='string'||value.id.length>200||typeof value.enabled!=='boolean'||value.cadence!=='hourly')return result({error:'Configuración inválida.'},400);
   await env.DB!.prepare("INSERT INTO settings(key,value) VALUES('server-schedule',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(JSON.stringify(value)).run();return result({saved:true,schedule:value});
  }
  const synced=await refresh(user?.userId??owner!);
  if(!user)await env.DB!.prepare("INSERT INTO settings(key,value) VALUES('background-last-run',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(JSON.stringify(synced)).run();
  return result(synced);
 }catch(e){return result({error:e instanceof PayloadError?e.message:'No se pudo sincronizar el radar.'},e instanceof PayloadError?e.status:503);}
}
export async function GET(){
 const user=await getChatGPTUser();if(!user)return result({error:'Inicia sesión para consultar el estado.'},401);
 if(user.userId!==serviceOwner())return result({configured:false});
 try{const rows=await env.DB!.prepare("SELECT key,value FROM settings WHERE key IN ('background-last-run','server-schedule')").all<{key:string;value:string}>();return result({configured:true,...Object.fromEntries(rows.results.map(r=>[r.key,JSON.parse(r.value)]))});}catch{return result({error:'No se pudo leer el estado.'},503);}
}
