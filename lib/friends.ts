import {MAX_REPOS,MAX_TARGETS,parseTarget} from './domain.ts';
import {SocialError,normalizeAlias} from './alias.ts';
export {SocialError,normalizeAlias} from './alias.ts';
export type PublicProfile={id:string;alias:string};
export type FriendRadar={profile:PublicProfile;games:{repo:string;title:string;url:string}[]};
type Profile={user_id:string;public_id:string;alias:string;discoverable:number};
type Relation={id:string;user_low:string;user_high:string;requester:string;state:string;version:number};
const MAX_CONTACTS=100;
export const publicProfile=(p:Profile):PublicProfile=>({id:p.public_id,alias:p.alias});
const profile=(db:D1Database,user:string)=>db.prepare('SELECT user_id,public_id,alias,discoverable FROM social_profiles WHERE user_id=?').bind(user).first<Profile>();
const unblocked='NOT EXISTS(SELECT 1 FROM social_blocks WHERE (blocker=? AND blocked=?) OR (blocker=? AND blocked=?))';
export async function socialLimit(db:D1Database,user:string,bucket:string,limit:number,period:number,now=Date.now()){
 const window=Math.floor(now/period);
 const result=await db.prepare('INSERT INTO social_limits(user_id,bucket,window,count) VALUES(?,?,?,1) ON CONFLICT(user_id,bucket) DO UPDATE SET window=excluded.window,count=CASE WHEN social_limits.window=excluded.window THEN social_limits.count+1 ELSE 1 END WHERE social_limits.window!=excluded.window OR social_limits.count<? RETURNING count').bind(user,bucket,window,limit).first();
 if(!result)throw new SocialError('Demasiadas solicitudes. Espera antes de volver a intentar.',429);
}
export async function socialSnapshot(db:D1Database,user:string){
 const me=await profile(db,user);if(!me)return {profile:null,relations:[],blocked:[]};
 const rows=await db.prepare(`SELECT r.id,r.requester,r.state,r.version,p.public_id,p.alias FROM social_relations r JOIN social_profiles p ON p.user_id=CASE WHEN r.user_low=? THEN r.user_high ELSE r.user_low END WHERE (r.user_low=? OR r.user_high=?) AND r.state IN ('pending','accepted') AND NOT EXISTS(SELECT 1 FROM social_blocks WHERE (blocker=? AND blocked=p.user_id) OR (blocker=p.user_id AND blocked=?)) ORDER BY p.alias LIMIT 100`).bind(user,user,user,user,user).all<{id:string;requester:string;state:string;version:number;public_id:string;alias:string}>();
 // A block belongs only to its creator; the blocked person cannot query it.
 const blocks=await db.prepare('SELECT p.public_id,p.alias FROM social_blocks b JOIN social_profiles p ON p.user_id=b.blocked WHERE b.blocker=? ORDER BY p.alias LIMIT 100').bind(user).all<{public_id:string;alias:string}>();
 return {profile:{...publicProfile(me),discoverable:!!me.discoverable},relations:rows.results.map(r=>({id:r.id,peer:{id:r.public_id,alias:r.alias},state:r.state==='accepted'?'friend':r.requester===user?'outgoing':'incoming',version:r.version})),blocked:blocks.results.map(p=>({id:p.public_id,alias:p.alias}))};
}
export async function searchProfiles(db:D1Database,user:string,input:unknown){
 const query=normalizeAlias(input);if(!await profile(db,user))throw new SocialError('Crea tu alias antes de buscar amigos.');
 await socialLimit(db,user,'search-minute',20,60_000);await socialLimit(db,user,'search-hour',100,3_600_000);
 // Exact alias search avoids a browseable user directory and wildcard enumeration.
 const p=await db.prepare(`SELECT user_id,public_id,alias,discoverable FROM social_profiles WHERE alias=? AND discoverable=1 AND user_id!=? AND NOT EXISTS(SELECT 1 FROM social_blocks WHERE (blocker=? AND blocked=social_profiles.user_id) OR (blocker=social_profiles.user_id AND blocked=?))`).bind(query,user,user,user).first<Profile>();
 if(!p)return {results:[]};
 const [low,high]=[user,p.user_id].sort();const relation=await db.prepare('SELECT id,user_low,user_high,requester,state,version FROM social_relations WHERE user_low=? AND user_high=?').bind(low,high).first<Relation>();
 return {results:[{...publicProfile(p),version:relation?.version??0,state:relation?.state==='accepted'?'friend':relation?.state==='pending'?(relation.requester===user?'outgoing':'incoming'):'none'}]};
}
export async function friendRadar(db:D1Database,user:string,peerId:unknown):Promise<FriendRadar>{
 if(typeof peerId!=='string'||! /^[0-9a-f-]{36}$/.test(peerId))throw new SocialError('Radar no disponible.',404);
 // Authorization and data are read in one statement, so revocation cannot race a later library query.
 const rows=await db.prepare(`SELECT p.public_id,p.alias,t.key,t.kind,t.label,t.repos FROM social_profiles p JOIN social_relations r ON ((r.user_low=? AND r.user_high=p.user_id) OR (r.user_high=? AND r.user_low=p.user_id)) LEFT JOIN targets t ON t.user_id=p.user_id WHERE p.public_id=? AND r.state='accepted' AND NOT EXISTS(SELECT 1 FROM social_blocks WHERE (blocker=? AND blocked=p.user_id) OR (blocker=p.user_id AND blocked=?)) ORDER BY t.created_at,t.key LIMIT ?`).bind(user,user,peerId,user,user,MAX_TARGETS).all<{public_id:string;alias:string;key:string|null;kind:string|null;label:string|null;repos:string|null}>();
 if(!rows.results.length)throw new SocialError('Radar no disponible. Actualiza tus amigos.',404);
 const games=new Map<string,FriendRadar['games'][number]>();
 for(const row of rows.results){
  let candidates:unknown[]=[];
  if(row.kind==='repo')candidates=[row.key];
  else if(row.kind==='org'){try{const parsed:unknown=JSON.parse(row.repos??'[]');if(Array.isArray(parsed))candidates=parsed.slice(0,MAX_REPOS);}catch{/* Ignore malformed stored sources. */}}
  for(const candidate of candidates){if(typeof candidate!=='string')continue;try{const parsed=parseTarget(candidate);if(parsed.kind!=='repo')continue;const repo=parsed.key,title=row.kind==='repo'&&row.label?.trim()?row.label.trim():repo.split('/')[1];const previous=games.get(repo);if(!previous||row.kind==='repo')games.set(repo,{repo,title,url:'https://github.com/'+repo});}catch{/* Never expose unsafe repository URLs. */}}
 }
 return {profile:{id:rows.results[0].public_id,alias:rows.results[0].alias},games:[...games.values()].sort((a,b)=>a.title.localeCompare(b.title)||a.repo.localeCompare(b.repo))};
}
export async function socialMutate(db:D1Database,user:string,input:unknown){
 if(!input||typeof input!=='object'||Array.isArray(input))throw new SocialError('Solicitud inválida.');
 const body=input as Record<string,unknown>,action=body.action;
 if(typeof action!=='string'||!['profile','request','accept','reject','cancel','remove','block','unblock'].includes(action))throw new SocialError('Acción inválida.');
 await socialLimit(db,user,'write-minute',20,60_000);await socialLimit(db,user,'write-hour',100,3_600_000);
 if(action==='profile'){
  const alias=normalizeAlias(body.alias);if(typeof body.discoverable!=='boolean')throw new SocialError('Elige si quieres aparecer en búsquedas.');
  const old=await profile(db,user);if(old&&old.alias!==alias)throw new SocialError('Tu alias es permanente; puedes ocultarlo de las búsquedas.');
  try{await db.prepare('INSERT INTO social_profiles(user_id,public_id,alias,discoverable,created_at) VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET discoverable=excluded.discoverable WHERE social_profiles.alias=excluded.alias').bind(user,crypto.randomUUID(),alias,Number(body.discoverable),new Date().toISOString()).run();}
  catch(e){if(e instanceof Error&&/UNIQUE constraint failed: social_profiles.alias/.test(e.message))throw new SocialError('Ese alias no está disponible.',409);throw e;}
  if((await profile(db,user))?.alias!==alias)throw new SocialError('El perfil fue creado con otro alias. Actualiza la lista.',409);
  return socialSnapshot(db,user);
 }
 if(!await profile(db,user))throw new SocialError('Crea tu alias primero.');
 if(typeof body.peer!=='string'||! /^[0-9a-f-]{36}$/.test(body.peer))throw new SocialError('Perfil no disponible.');
 const peer=await db.prepare('SELECT user_id,public_id,alias,discoverable FROM social_profiles WHERE public_id=? AND user_id!=?').bind(body.peer,user).first<Profile>();
 if(!peer)throw new SocialError('Perfil no disponible.');
 const [low,high]=[user,peer.user_id].sort();
 const getRelation=()=>db.prepare('SELECT id,user_low,user_high,requester,state,version FROM social_relations WHERE user_low=? AND user_high=?').bind(low,high).first<Relation>();
 const prior=await getRelation();
 if(action==='unblock'){await db.prepare('DELETE FROM social_blocks WHERE blocker=? AND blocked=?').bind(user,peer.user_id).run();return socialSnapshot(db,user);}
 if(action==='block'){
  if(!prior&&!peer.discoverable)throw new SocialError('Perfil no disponible.');
  const existing=await db.prepare('SELECT 1 FROM social_blocks WHERE blocker=? AND blocked=?').bind(user,peer.user_id).first();
  if(!existing){const count=await db.prepare('SELECT count(*) AS n FROM social_blocks WHERE blocker=?').bind(user).first<{n:number}>();if((count?.n??0)>=MAX_CONTACTS)throw new SocialError('Has alcanzado el límite de bloqueos.');}
  await db.batch([
   db.prepare('INSERT INTO social_blocks(blocker,blocked,created_at) SELECT ?,?,? WHERE (SELECT count(*) FROM social_blocks WHERE blocker=?)<100 ON CONFLICT(blocker,blocked) DO NOTHING').bind(user,peer.user_id,new Date().toISOString(),user),
   db.prepare("UPDATE social_relations SET state='closed',version=version+1 WHERE user_low=? AND user_high=? AND state!='closed' AND EXISTS(SELECT 1 FROM social_blocks WHERE blocker=? AND blocked=?)").bind(low,high,user,peer.user_id),
  ]);
  if(!await db.prepare('SELECT 1 FROM social_blocks WHERE blocker=? AND blocked=?').bind(user,peer.user_id).first())throw new SocialError('Has alcanzado el límite de bloqueos.',409);
  return socialSnapshot(db,user);
 }
 const blocked=await db.prepare('SELECT 1 FROM social_blocks WHERE (blocker=? AND blocked=?) OR (blocker=? AND blocked=?)').bind(user,peer.user_id,peer.user_id,user).first();if(blocked)throw new SocialError('Perfil no disponible.');
 if(!Number.isSafeInteger(body.version)||Number(body.version)<0)throw new SocialError('Actualiza la lista antes de continuar.',409);
 const version=Number(body.version);
 if(action==='request'){
  if(!peer.discoverable)throw new SocialError('Perfil no disponible.');
  // Crossed requests remain pending. Friendship always requires the recipient's explicit acceptance.
  if(prior&&(prior.state==='accepted'||prior.state==='pending'))return socialSnapshot(db,user);
  const changed=await db.prepare(`INSERT INTO social_relations(id,user_low,user_high,requester,state,version) SELECT ?,?,?,?,'pending',1 WHERE ?=0 AND ${unblocked} AND EXISTS(SELECT 1 FROM social_profiles WHERE user_id=? AND discoverable=1) AND (SELECT count(*) FROM social_relations WHERE (user_low=? OR user_high=?) AND state!='closed')<100 AND (SELECT count(*) FROM social_relations WHERE (user_low=? OR user_high=?) AND state!='closed')<100 ON CONFLICT(user_low,user_high) DO UPDATE SET requester=excluded.requester,state='pending',version=social_relations.version+1 WHERE social_relations.state='closed' AND social_relations.version=? AND ${unblocked} AND EXISTS(SELECT 1 FROM social_profiles WHERE user_id=? AND discoverable=1) RETURNING id`).bind(crypto.randomUUID(),low,high,user,prior?0:version,user,peer.user_id,peer.user_id,user,peer.user_id,user,user,peer.user_id,peer.user_id,version,user,peer.user_id,peer.user_id,user,peer.user_id).first();
  if(!changed)throw new SocialError('La relación cambió o se alcanzó el límite. Actualiza la lista.',409);
  return socialSnapshot(db,user);
 }
 if(!prior)throw new SocialError('Actualiza la lista antes de continuar.',409);
 const next=action==='accept'?'accepted':'closed';
 const allowed=action==='accept'||action==='reject'?prior.state==='pending'&&prior.requester!==user:action==='cancel'?prior.state==='pending'&&prior.requester===user:prior.state==='accepted';
 // A replay is harmless; an old command cannot act on a later request (ABA).
 if(!allowed){if(prior.state===next&&prior.version===version+1)return socialSnapshot(db,user);throw new SocialError('Esta acción ya no corresponde al estado actual.',409);}
 const changed=await db.prepare(`UPDATE social_relations SET state=?,version=version+1 WHERE user_low=? AND user_high=? AND version=? AND state=? AND requester=? AND ${unblocked} RETURNING id`).bind(next,low,high,version,prior.state,prior.requester,user,peer.user_id,peer.user_id,user).first();
 if(!changed)throw new SocialError('La relación cambió. Actualiza la lista antes de continuar.',409);
 return socialSnapshot(db,user);
}
