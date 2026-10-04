import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../../chatgpt-auth';
export const dynamic='force-dynamic';
// Diagnostic for the visitor's own identity only. Never returns email/name or other users.
// An administrator can verify this value in the owner's authenticated session before
// explicitly configuring the background scope. It does not configure anything.
export async function GET(){const user=await getChatGPTUser();return Response.json(user?{authenticated:true,userId:user.userId,provider:'Sites/ChatGPT',backgroundConfigured:user.userId===(env as unknown as {BACKGROUND_OWNER_USER_ID?:string}).BACKGROUND_OWNER_USER_ID?.trim()}:{error:'Inicia sesión con ChatGPT.'},{status:user?200:401,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});}
