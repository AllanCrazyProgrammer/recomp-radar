import {getChatGPTUser} from '../../chatgpt-auth';
import {snapshot,mutate} from '@/lib/radar';
import {GithubError} from '@/lib/github';
export const dynamic='force-dynamic';
const result=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(){const user=await getChatGPTUser();if(!user)return result({error:'Inicia sesión con ChatGPT para acceder a tu radar.'},401);try{return result(await snapshot(user.userId));}catch{return result({error:'No se pudo abrir tu radar. Comprueba la conexión o intenta de nuevo.'},503);}}
export async function POST(request:Request){const user=await getChatGPTUser();if(!user)return result({error:'Inicia sesión con ChatGPT para acceder a tu radar.'},401);const origin=request.headers.get('origin');if(origin&&new URL(origin).host!==request.headers.get('host'))return result({error:'Origen no permitido.'},403);try{const text=await request.text();if(text.length>100000)return result({error:'Solicitud demasiado grande.'},413);const body=JSON.parse(text);return result({result:await mutate(user.userId,body),state:await snapshot(user.userId)});}catch(e){return result({error:e instanceof Error?e.message:'No se pudo completar la acción.'},e instanceof GithubError?e.status:400);}}
