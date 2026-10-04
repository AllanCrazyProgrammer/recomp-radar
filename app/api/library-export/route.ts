import {getChatGPTUser} from '../../chatgpt-auth';
import {snapshot} from '@/lib/radar';
export const dynamic='force-dynamic';

// A visitor can export only their own library; no service identity fallback.
export async function GET(){
 const user=await getChatGPTUser();
 if(!user)return Response.json({error:'Inicia sesión para descargar tu biblioteca.'},{status:401});
 const {targets,events,releases,installations,covers}=await snapshot(user.userId);
 return Response.json({format:1,exportedAt:new Date().toISOString(),targets,events,releases,installations,covers},{headers:{
  'Cache-Control':'private, no-store',
  'Content-Disposition':'attachment; filename="recomp-radar-library.json"',
  'X-Content-Type-Options':'nosniff',
 }});
}
