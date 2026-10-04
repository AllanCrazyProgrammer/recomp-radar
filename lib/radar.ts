import {env} from 'cloudflare:workers';
import {github,getRate} from './github';
import {MAX_REPOS,MAX_TARGETS,parseTarget,type Target,type RadarEvent} from './domain';
import {installationFromRelease,manualInstallation,releaseTag,type Installation} from './library';
import {releaseDownloads} from './release-assets';
import {eventEndpoints} from './github-data';
import {syncTargets} from './sync';
import type {GithubRepo,GithubOrg,GithubEvent} from './github-data';
type TargetRow={id:string;key:string;kind:Target['kind'];label:string;priority:number;repos:string;created_at:string;last_sync:string|null;error:string|null};
type InstallationRow={repo:string;release_id:string|null;tag:string;title:string;published_at:string|null;prerelease:number|null;marked_at:string};
type EventResult={id:string;repo:string;kind:string;title:string;body:string;url:string;date:string;source_updated:string|null;revision:string;status:string;assets:number;first_seen:string;detected_at:string;release_tag:string|null;read_revision:string|null};
const db=()=>{if(!env.DB)throw new Error('La base de datos no está disponible.');return env.DB;};
export async function listTargets(userId:string):Promise<Target[]>{if(!userId)throw new Error('Se requiere una cuenta explícita.');const rows=await db().prepare('SELECT * FROM targets WHERE user_id=? ORDER BY priority DESC,created_at ASC').bind(userId).all<TargetRow>();return rows.results.map(r=>({id:r.id,key:r.key,kind:r.kind,label:r.label,priority:r.priority,repos:JSON.parse(r.repos),createdAt:r.created_at,lastSync:r.last_sync,error:r.error}));}
export async function addTarget(userId:string,input:string,label:string){
 const parsed=parseTarget(input);const existing=await listTargets(userId);if(existing.some(t=>t.key===parsed.key))throw new Error('Ya sigues ese proyecto.');if(existing.length>=MAX_TARGETS)throw new Error(`Puedes seguir hasta ${MAX_TARGETS} fuentes.`);
 let repos:string[]=[];let key=parsed.key;
 if(parsed.kind==='repo'){const repo=await github<GithubRepo>('/repos/'+key);if(repo.private)throw new Error('Solo repositorios públicos.');key=repo.full_name.toLowerCase();repos=[repo.full_name];}
 else{const org=await github<GithubOrg>('/orgs/'+key);key=org.login.toLowerCase();const rows=await github<GithubRepo[]>(`/orgs/${key}/repos?per_page=100&sort=pushed&direction=desc&type=public`);repos=rows.filter(r=>!r.archived&&!r.fork).slice(0,MAX_REPOS).map(r=>r.full_name);if(!repos.length)throw new Error('La organización no tiene repositorios públicos activos en la primera página.');}
 const targetId=crypto.randomUUID();
 await db().prepare('INSERT INTO targets(id,user_id,key,kind,label,priority,repos,created_at) VALUES(?,?,?,?,?,0,?,?)').bind(targetId,userId,key,parsed.kind,label.trim().slice(0,60)||key.split('/').pop(),JSON.stringify(repos),new Date().toISOString()).run();
 return targetId;
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
 const mapEvent=(r:EventResult):RadarEvent=>({id:r.id,repo:r.repo,kind:r.kind as RadarEvent['kind'],title:r.title,body:r.body,url:r.url,date:r.date,sourceUpdated:r.source_updated,revision:r.revision,status:r.status,assets:r.assets,releaseTag:r.release_tag,firstSeen:r.first_seen,detectedAt:r.detected_at,read:r.read_revision===r.revision,label:targets.find(t=>t.repos.includes(r.repo))?.label,priority:Math.max(0,...targets.filter(t=>t.repos.includes(r.repo)).map(t=>t.priority))});
 let events:RadarEvent[]=[],releases:RadarEvent[]=[];
 if(repos.length){
   const filter=repos.map(()=>'?').join(',');
   const rows=await db().prepare(`SELECT e.*,r.revision AS read_revision FROM events e LEFT JOIN reads r ON r.event_id=e.id AND r.user_id=? WHERE e.repo IN (${filter}) ORDER BY e.detected_at DESC,e.date DESC LIMIT 500`).bind(userId,...repos).all<EventResult>();
   events=rows.results.map(mapEvent);
   // Library release comparison does not depend on the 500-item activity window.
   const releaseRows=await db().prepare(`SELECT e.*,r.revision AS read_revision FROM (SELECT *,ROW_NUMBER() OVER(PARTITION BY repo ORDER BY date DESC,id) AS rank FROM events WHERE kind='release' AND repo IN (${filter})) e LEFT JOIN reads r ON r.event_id=e.id AND r.user_id=? WHERE e.rank<=20 ORDER BY e.date DESC`).bind(...repos,userId).all<EventResult>();
   releases=releaseRows.results.map(mapEvent);
 }
 // Reuse captured release assets. Opening the page never spends GitHub quota.
 const paths=repos.map(repo=>`/repos/${repo}${eventEndpoints.release}`);
 const cached=paths.length?await db().prepare(`SELECT path,json,checked_at FROM cache WHERE path IN (${paths.map(()=>'?').join(',')})`).bind(...paths).all<{path:string;json:string;checked_at:number}>():{results:[]};
 const releaseTimes=new Map<string,string>();
 const files=new Map<string,ReturnType<typeof releaseDownloads>>();
 for(const row of cached.results){
  const repo=repos.find(repo=>`/repos/${repo}${eventEndpoints.release}`===row.path);if(!repo)continue;
  const checked=new Date(row.checked_at);if(Number.isFinite(checked.getTime()))releaseTimes.set(repo.toLowerCase(),checked.toISOString());
  try{const rows=JSON.parse(row.json) as GithubEvent[];if(!Array.isArray(rows))continue;
   for(const release of rows){if(!release.draft&&release.id&&release.tag_name)files.set(`${repo}:release:${release.id}`,releaseDownloads(repo,release.tag_name,release.assets));}
  }catch{/* A malformed legacy cache cannot stop the library from opening. */}
 }
 for(const event of [...events,...releases])if(event.kind==='release')event.downloads=files.get(event.id)??[];
 const checks=repos.map(repo=>({repo,releasesAt:releaseTimes.get(repo.toLowerCase())??null,lastSync:targets.find(t=>t.repos.includes(repo))?.lastSync??null,error:targets.filter(t=>t.repos.includes(repo)).map(t=>t.error).filter(Boolean).join(' ')||null}));
 const installationRows=await db().prepare('SELECT * FROM installations WHERE user_id=?').bind(userId).all<InstallationRow>();
 const allowed=new Set(repos.map(r=>r.toLowerCase()));
 const installations:Installation[]=installationRows.results.filter(r=>allowed.has(r.repo)).map(r=>({repo:r.repo,releaseId:r.release_id,tag:r.tag,title:r.title,publishedAt:r.published_at,prerelease:r.prerelease===null?null:!!r.prerelease,markedAt:r.marked_at}));
 const coverRows=await db().prepare('SELECT repo,updated_at FROM game_covers WHERE user_id=?').bind(userId).all<{repo:string;updated_at:string}>();
 const covers=coverRows.results.filter(r=>allowed.has(r.repo)).map(r=>({repo:r.repo,updatedAt:r.updated_at}));
 const schedule=await db().prepare("SELECT value FROM settings WHERE key='server-schedule'").first<{value:string}>();
 let sync=await db().prepare("SELECT value FROM settings WHERE key=?").bind('last-sync:'+userId).first<{value:string}>();
 // Legacy aggregate belongs only to an explicitly verified service owner.
 if(!sync&&userId===(env as unknown as {BACKGROUND_OWNER_USER_ID?:string}).BACKGROUND_OWNER_USER_ID?.trim())sync=await db().prepare("SELECT value FROM settings WHERE key='last-sync'").first<{value:string}>();
 return {targets,events,releases,installations,covers,checks,rate:await getRate(),lastSync:sync?JSON.parse(sync.value):null,limits:{maxRepos:MAX_REPOS,maxTargets:MAX_TARGETS,cacheMinutes:30,releases:20,commits:30,prs:30,feed:500},background:!!(userId===(env as unknown as {BACKGROUND_OWNER_USER_ID?:string}).BACKGROUND_OWNER_USER_ID?.trim()&&schedule&&JSON.parse(schedule.value).enabled)};
}
export async function refresh(userId:string,fresh=false,targetId?:string){
 if(!userId)throw new Error('Se requiere una cuenta explícita.');
 return syncTargets({db:db(),github,listTargets:()=>listTargets(userId),syncKey:'last-sync:'+userId},{fresh,targetId});
}
export async function mutate(userId:string,input:unknown){
 if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Solicitud inválida.');
 const body=input as Record<string,unknown>;
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
 if(body.action==='add'){if(typeof body.input!=='string'||(body.label!=null&&typeof body.label!=='string'))throw new Error('Entrada inválida.');const targetId=await addTarget(userId,body.input,typeof body.label==='string'?body.label:'');return {added:true,targetId};}
 if(body.action==='refresh'){if(body.targetId!==undefined&&typeof body.targetId!=='string')throw new Error('Fuente inválida.');return refresh(userId,body.fresh===true,body.targetId);}
 if(body.action==='remove'||body.action==='priority'){if(typeof body.id!=='string')throw new Error('Fuente inválida.');if(body.action==='remove')await db().prepare('DELETE FROM targets WHERE id=? AND user_id=?').bind(body.id,userId).run();else await db().prepare('UPDATE targets SET priority=? WHERE id=? AND user_id=?').bind(body.priority===true?1:0,body.id,userId).run();return {ok:true};}
 if(body.action==='read'){if(!Array.isArray(body.ids)||body.ids.length>500||body.ids.some((id:unknown)=>typeof id!=='string'))throw new Error('Selección de novedades inválida.');const state=await snapshot(userId);const allowed=new Map([...state.events,...state.releases].map(e=>[e.id,e]));const statements=body.ids.filter((id:string)=>allowed.has(id)).map((id:string)=>body.read===false?db().prepare('DELETE FROM reads WHERE user_id=? AND event_id=?').bind(userId,id):db().prepare('INSERT INTO reads(user_id,event_id,revision,read_at) VALUES(?,?,?,?) ON CONFLICT(user_id,event_id) DO UPDATE SET revision=excluded.revision,read_at=excluded.read_at').bind(userId,id,allowed.get(id)!.revision,new Date().toISOString()));if(statements.length)await db().batch(statements);return {ok:true};}
 throw new Error('Acción desconocida.');
}
