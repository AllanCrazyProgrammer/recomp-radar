import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../../chatgpt-auth';
import {boundedJson,PayloadError} from '@/lib/request-json';
import {SocialError,socialMutate,socialSnapshot,searchProfiles,friendRadar} from '@/lib/friends';
export const dynamic='force-dynamic';
const response=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',...(status===429?{'Retry-After':'60'}:{})}});
export async function GET(request:Request){const user=await getChatGPTUser();if(!user)return response({error:'Inicia sesión con ChatGPT.'},401);try{if(!env.DB)return response({error:'Servicio no disponible.'},503);const params=new URL(request.url).searchParams,q=params.get('q'),peer=params.get('radar');if(q!==null&&peer!==null)throw new SocialError('Consulta inválida.');return response(peer!==null?await friendRadar(env.DB,user.userId,peer):q===null?await socialSnapshot(env.DB,user.userId):await searchProfiles(env.DB,user.userId,q));}catch(e){return response({error:e instanceof SocialError?e.message:'No se pudo abrir Amigos.'},e instanceof SocialError?e.status:503);}}
export async function POST(request:Request){
 const user=await getChatGPTUser();if(!user)return response({error:'Inicia sesión con ChatGPT.'},401);
 // Browser writes require an exact Origin; native same-origin fetch supplies it.
 const origin=request.headers.get('origin');if(!origin||origin!==new URL(request.url).origin||request.headers.get('sec-fetch-site')==='cross-site')return response({error:'Origen no permitido.'},403);
 if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))return response({error:'Formato no permitido.'},415);
 try{const body=await boundedJson(request,2048);if(!env.DB)return response({error:'Servicio no disponible.'},503);return response(await socialMutate(env.DB,user.userId,body));}catch(e){return response({error:e instanceof SocialError||e instanceof PayloadError?e.message:'No se pudo completar la acción.'},e instanceof SocialError||e instanceof PayloadError?e.status:503);}
}
