import {env} from 'cloudflare:workers';
import {github,syncRepo,getRate} from './github';
import {MAX_REPOS,MAX_TARGETS,parseTarget,type Target,type RadarEvent} from './domain';
import {installationFromRelease,manualInstallation,releaseTag,type Installation} from './library';
const db=()=>{if(!env.DB)throw new Error('La base de datos no está disponible.');return env.DB;};
export async function listTargets(userId?:string):Promise<Target[]>{const rows=await db().prepare('SELECT * FROM targets'+(userId?' WHERE user_id=?':'')+' ORDER BY priority DESC,created_at ASC').bind(...(userId?[userId]:[])).all<any>();return rows.results.map(r=>({id:r.id,key:r.key,kind:r.kind,label:r.label,priority:r.priority,repos:JSON.parse(r.repos),createdAt:r.created_at,lastSync:r.last_sync,error:r.error}));}
export async function addTarget(userId:string,input:string,label:string){
 const parsed=parseTarget(input);const existing=await listTargets(userId);if(existing.some(t=>t.key===parsed.key))throw new Error('Ya sigues ese proyecto.');if(existing.length>=MAX_TARGETS)throw new Error(`Puedes seguir hasta ${MAX_TARGETS} fuentes.`);
 let repos:string[]=[];let key=parsed.key;
 if(parsed.kind==='repo'){const repo=await github<any>('/repos/'+key);if(repo.private)throw new Error('Solo repositorios públicos.');key=repo.full_name.toLowerCase();repos=[repo.full_name];}
 else{const org=await github<any>('/orgs/'+key);key=org.login.toLowerCase();const rows=await github<any[]>(`/orgs/${key}/repos?per_page=100&sort=pushed&direction=desc&type=public`);repos=rows.filter(r=>!r.archived&&!r.fork).slice(0,MAX_REPOS).map(r=>r.full_name);if(!repos.length)throw new Error('La organización no tiene repositorios públicos activos en la primera página.');}
 await db().prepare('INSERT INTO targets(id,user_id,key,kind,label,priority,repos,created_at) VALUES(?,?,?,?,?,0,?,?)').bind(crypto.randomUUID(),userId,key,parsed.kind,label.trim().slice(0,60)||key.split('/').pop(),JSON.stringify(repos),new Date().toISOString()).run();
}
export async function followedRepo(userId:string, value:unknown){
 if(typeof value!=='string'||value.length>200)throw new Error('Juego inválido.');
 const targets=await listTargets(userId);
 const repo=targets.flatMap(t=>t.repos).find(r=>r.toLowerCase()===value.toLowerCase());
 if(!repo)throw new Error('Este juego no pertenece a tus fuentes seguidas.');
 return repo;
}
export async function snapshot(userId:string){
 const targets=await listTargets(userId);
 const repos=[...new Set(targets.flatMap(t=>t.repos))];
 const mapEvent=(r:any):RadarEvent=>({id:r.id,repo:r.repo,kind:r.kind,title:r.title,body:r.body,url:r.url,date:r.date,sourceUpdated:r.source_updated,revision:r.revision,status:r.status,assets:r.assets,releaseTag:r.release_tag,firstSeen:r.first_seen,detectedAt:r.detected_at,read:r.read_revision===r.revision,label:targets.find(t=>t.repos.includes(r.repo))?.label,priority:Math.max(0,...targets.filter(t=>t.repos.includes(r.repo)).map(t=>t.priority))});
 let events:RadarEvent[]=[],releases:RadarEvent[]=[];
 if(repos.length){
   const filter=repos.map(()=>'?').join(',');
   const rows=await db().prepare(`SELECT e.*,r.revision AS read_revision FROM events e LEFT JOIN reads r ON r.event_id=e.id AND r.user_id=? WHERE e.repo IN (${filter}) ORDER BY e.detected_at DESC,e.date DESC LIMIT 500`).bind(userId,...repos).all<any>();
   events=rows.results.map(mapEvent);
   // Library release comparison does not depend on the 500-item activity window.
   const releaseRows=await db().prepare(`SELECT e.*,r.revision AS read_revision FROM (SELECT *,ROW_NUMBER() OVER(PARTITION BY repo ORDER BY date DESC,id) AS rank FROM events WHERE kind='release' AND repo IN (${filter})) e LEFT JOIN reads r ON r.event_id=e.id AND r.user_id=? WHERE e.rank<=20 ORDER BY e.date DESC`).bind(...repos,userId).all<any>();
   releases=releaseRows.results.map(mapEvent);
 }
 const installationRows=await db().prepare('SELECT * FROM installations WHERE user_id=?').bind(userId).all<any>();
 const allowed=new Set(repos.map(r=>r.toLowerCase()));
 const installations:Installation[]=installationRows.results.filter(r=>allowed.has(r.repo)).map(r=>({repo:r.repo,releaseId:r.release_id,tag:r.tag,title:r.title,publishedAt:r.published_at,prerelease:r.prerelease===null?null:!!r.prerelease,markedAt:r.marked_at}));
 const coverRows=await db().prepare('SELECT repo,updated_at FROM game_covers WHERE user_id=?').bind(userId).all<{repo:string;updated_at:string}>();
 const covers=coverRows.results.filter(r=>allowed.has(r.repo)).map(r=>({repo:r.repo,updatedAt:r.updated_at}));
 const schedule=await db().prepare("SELECT value FROM settings WHERE key='server-schedule'").first<{value:string}>();
 const sync=await db().prepare("SELECT value FROM settings WHERE key='last-sync'").first<{value:string}>();
 return {targets,events,releases,installations,covers,rate:await getRate(),lastSync:sync?JSON.parse(sync.value):null,limits:{maxRepos:MAX_REPOS,maxTargets:MAX_TARGETS,cacheMinutes:30,releases:20,commits:30,prs:30,feed:500},background:!!(schedule&&JSON.parse(schedule.value).enabled)};
}
export async function refresh(userId?:string,fresh=false){
 const now=Date.now();const lock=await db().prepare("INSERT INTO settings(key,value) VALUES('refresh-lock',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE CAST(settings.value AS INTEGER)<? RETURNING value").bind(String(now+180000),now).first();
 if(!lock)return {busy:true,added:0,changed:0,errors:['Ya hay una sincronización en curso. Espera unos segundos.'],repos:[]};
 let added=0,changed=0;const errors:string[]=[];const checked:string[]=[];
 try{
 const targets=await listTargets(userId);
 for(const target of targets.filter(t=>t.kind==='org')){try{const rows=await github<any[]>(`/orgs/${target.key}/repos?per_page=100&sort=pushed&direction=desc&type=public`,fresh);target.repos=rows.filter(r=>!r.archived&&!r.fork).slice(0,MAX_REPOS).map(r=>r.full_name);await db().prepare('UPDATE targets SET repos=? WHERE id=?').bind(JSON.stringify(target.repos),target.id).run();}catch(e){errors.push(`${target.key}: ${e instanceof Error?e.message:'Error de organización'}`);}}
 const allRepos=[...new Set([...targets.filter(t=>t.kind==='repo'),...targets.filter(t=>t.kind==='org')].flatMap(t=>t.repos))];const repos=allRepos.slice(0,MAX_REPOS);
 if(allRepos.length>MAX_REPOS)errors.push(`Se consultan ${MAX_REPOS} repositorios por ciclo; prioriza fuentes o elimina alguna para ampliar la cobertura. ${allRepos.length-MAX_REPOS} quedan fuera de este ciclo.`);
 for(const repo of repos){try{const incoming=await syncRepo(repo,fresh);const timestamp=new Date().toISOString();
 for(const e of incoming){const old=await db().prepare('SELECT revision,first_seen,detected_at FROM events WHERE id=?').bind(e.id).first<{revision:string;first_seen:string;detected_at:string}>();if(!old)added++;else if(old.revision!==e.revision)changed++;
 await db().prepare('INSERT INTO events(id,repo,kind,title,body,url,date,source_updated,revision,status,assets,first_seen,detected_at,release_tag) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,body=excluded.body,url=excluded.url,date=excluded.date,source_updated=excluded.source_updated,revision=excluded.revision,status=excluded.status,assets=excluded.assets,detected_at=excluded.detected_at,release_tag=excluded.release_tag').bind(e.id,e.repo,e.kind,e.title,e.body,e.url,e.date,e.sourceUpdated,e.revision,e.status,e.assets,old?.first_seen??timestamp,old&&old.revision===e.revision?old.detected_at:timestamp,e.releaseTag??null).run();}
 checked.push(repo);
 }catch(e){errors.push(`${repo}: ${e instanceof Error?e.message:'No se pudo actualizar'}`);}}
 for(const target of targets){const ownErrors=errors.filter(e=>e.startsWith(target.key+':')||target.repos.some(r=>e.startsWith(r+':')));const coverage=target.repos.filter(r=>!checked.includes(r));if(coverage.length)ownErrors.push(`${coverage.length} repositorios sin comprobar en este ciclo.`);await db().prepare('UPDATE targets SET last_sync=?,error=? WHERE id=?').bind(coverage.length===0?new Date().toISOString():target.lastSync,ownErrors.join(' ')||null,target.id).run();}
 const result={busy:false,added,changed,errors,repos:checked,at:new Date().toISOString()};await db().prepare("INSERT INTO settings(key,value) VALUES('last-sync',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(JSON.stringify(result)).run();return result;
 }finally{await db().prepare("DELETE FROM settings WHERE key='refresh-lock' AND value=?").bind(String(now+180000)).run();}
}
export async function mutate(userId:string,body:any){
 if(body.action==='setInstalled'||body.action==='clearInstalled'){
   const repo=(await followedRepo(userId,body.repo)).toLowerCase();
   if(body.action==='clearInstalled'){
     await db().prepare('DELETE FROM installations WHERE user_id=? AND repo=?').bind(userId,repo).run();
     return {ok:true};
   }
   const markedAt=new Date().toISOString();
   let installation:Installation;
   if(typeof body.releaseId==='string'&&body.tag===undefined){
     const state=await snapshot(userId);
     const release=[...state.releases,...state.events].find(e=>e.id===body.releaseId&&e.repo.toLowerCase()===repo);
     if(!release)throw new Error('Esta release no pertenece a este juego o no está capturada.');
     installation=installationFromRelease(release,markedAt);
   }else if(typeof body.tag==='string'&&body.releaseId===undefined){
     installation=manualInstallation(repo,body.tag,markedAt);
     const state=await snapshot(userId);
     const known=[...state.releases,...state.events].find(e=>e.kind==='release'&&e.repo.toLowerCase()===repo&&releaseTag(e)===installation.tag);
     if(known)installation=installationFromRelease(known,markedAt);
   }else throw new Error('Selecciona una release o escribe una etiqueta de versión.');
   await db().prepare('INSERT INTO installations(user_id,repo,release_id,tag,title,published_at,prerelease,marked_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(user_id,repo) DO UPDATE SET release_id=excluded.release_id,tag=excluded.tag,title=excluded.title,published_at=excluded.published_at,prerelease=excluded.prerelease,marked_at=excluded.marked_at').bind(userId,repo,installation.releaseId,installation.tag,installation.title,installation.publishedAt,installation.prerelease===null?null:Number(installation.prerelease),installation.markedAt).run();
   return {ok:true};
 }
 if(body.action==='add'){if(typeof body.input!=='string'||(body.label!=null&&typeof body.label!=='string'))throw new Error('Entrada inválida.');await addTarget(userId,body.input,body.label??'');return {added:true};}
 if(body.action==='refresh')return refresh(userId,body.fresh===true);
 if(body.action==='remove'||body.action==='priority'){if(typeof body.id!=='string')throw new Error('Fuente inválida.');if(body.action==='remove')await db().prepare('DELETE FROM targets WHERE id=? AND user_id=?').bind(body.id,userId).run();else await db().prepare('UPDATE targets SET priority=? WHERE id=? AND user_id=?').bind(body.priority===true?1:0,body.id,userId).run();return {ok:true};}
 if(body.action==='read'){if(!Array.isArray(body.ids)||body.ids.length>500||body.ids.some((id:unknown)=>typeof id!=='string'))throw new Error('Selección de novedades inválida.');const state=await snapshot(userId);const allowed=new Map([...state.events,...state.releases].map(e=>[e.id,e]));const statements=body.ids.filter((id:string)=>allowed.has(id)).map((id:string)=>body.read===false?db().prepare('DELETE FROM reads WHERE user_id=? AND event_id=?').bind(userId,id):db().prepare('INSERT INTO reads(user_id,event_id,revision,read_at) VALUES(?,?,?,?) ON CONFLICT(user_id,event_id) DO UPDATE SET revision=excluded.revision,read_at=excluded.read_at').bind(userId,id,allowed.get(id)!.revision,new Date().toISOString()));if(statements.length)await db().batch(statements);return {ok:true};}
 throw new Error('Acción desconocida.');
}
