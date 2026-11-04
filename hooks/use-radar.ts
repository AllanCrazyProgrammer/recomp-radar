'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {onAuthStateChanged,signInWithPopup,signOut} from 'firebase/auth';
import {signInWithDesktopCredential} from '@/lib/desktop-signin';
import {doc,setDoc} from 'firebase/firestore';
import {auth,db,githubProvider,googleProvider,firebaseConfigured} from '@/lib/firebase';
import {mergeEvents,parseTarget,type RadarEvent,type Target} from '@/lib/domain';
import {readLibrary,saveTarget,removeTarget,setTargetPriority,saveInstallation,deleteInstallation,saveCover,importLibrary,importMapping} from '@/lib/firestore-data';
import {installationFromRelease,manualInstallation} from '@/lib/library';
import {createRefreshQueue,type RefreshJob} from '@/lib/refresh-queue';
import {releaseDownloads} from '@/lib/release-assets';
import {catalogGet} from '@/lib/quiver-catalog';
import {INDEX_TTL_MS,loadIndex,toGithubReleases,type QuiverIndex} from '@/lib/quiver-releases';
export type Cover={repo:string;updatedAt:string;url?:string;dataUrl?:string;dataUrl2x?:string};
export type RepoCheck={repo:string;releasesAt:string|null;lastSync:string|null;error:string|null};
type State={checks:RepoCheck[];targets:Target[];events:RadarEvent[];releases:RadarEvent[];installations:import('@/lib/library').Installation[];covers:Cover[];rate:{remaining:number|null;limit:number|null;reset:number|null;blockedUntil:number|null};lastSync:{at:string;errors:string[];repos:string[]}|null;background:boolean;limits:{maxRepos:number}};
const blank:State={checks:[],targets:[],events:[],releases:[],installations:[],covers:[],rate:{remaining:null,limit:60,reset:null,blockedUntil:null},lastSync:null,background:false,limits:{maxRepos:100}};
export type Act=(body:Record<string,unknown>,silent?:boolean)=>Promise<boolean>;
const cacheKey=(repo:string)=>'recomp-radar-github:'+repo.toLowerCase();
// Como Quiver Launcher: si el repositorio está en su catálogo, sus versiones vienen de su API (en caché para
// todos) y no gastan la cuota pública de GitHub (60/h). Solo los demás repositorios se consultan en GitHub.
const QUIVER_INDEX_KEY='recomp-radar-quiver-index';
let indexLoad:Promise<QuiverIndex|null>|null=null;
function quiverIndex():Promise<QuiverIndex|null>{
 const saved=(()=>{try{return JSON.parse(localStorage.getItem(QUIVER_INDEX_KEY)??'null') as QuiverIndex|null}catch{return null}})();
 if(saved&&Date.now()-saved.at<INDEX_TTL_MS)return Promise.resolve(saved);
 indexLoad??=loadIndex().then(index=>{try{localStorage.setItem(QUIVER_INDEX_KEY,JSON.stringify(index));}catch{/* Caché opcional. */}return index;},()=>saved).finally(()=>{indexLoad=null;});
 return indexLoad;
}
async function fromQuiver(repo:string,force:boolean,knownIds:Record<string,string>):Promise<unknown[]|null>{
 const slug=(await quiverIndex())?.slugs[repo.toLowerCase()];
 if(!slug)return null;
 const key='recomp-radar-quiver:'+repo.toLowerCase(),now=Date.now();
 const saved=(()=>{try{return JSON.parse(localStorage.getItem(key)??'null') as {checkedAt:number;data:unknown}|null}catch{return null}})();
 if(saved&&now-saved.checkedAt<(force?5:30)*60_000)return toGithubReleases(repo,saved.data,knownIds);
 try{
  const data=await catalogGet('/apps/'+encodeURIComponent(slug)+'/release-history?limit=20');
  try{localStorage.setItem(key,JSON.stringify({checkedAt:now,data}));}catch{/* Caché opcional. */}
  return toGithubReleases(repo,data,knownIds);
 }catch{return saved?toGithubReleases(repo,saved.data,knownIds):null;}
}
async function github(repo:string,force=false){
 const key=cacheKey(repo),now=Date.now(),saved=(()=>{try{return JSON.parse(localStorage.getItem(key)??'null')}catch{return null}})();
 if(!force&&saved?.checkedAt>now-30*60_000)return {items:saved.items as unknown[],remaining:saved.remaining,reset:saved.reset};
 const budgetKey='recomp-radar-github-budget',attempts=(()=>{try{return (JSON.parse(localStorage.getItem(budgetKey)??'[]') as number[]).filter(t=>t>now-3_600_000)}catch{return []}})();
 if(attempts.length>=50)throw Object.assign(new Error('Límite local de consultas: quedan menos de 50 comprobaciones disponibles por hora.'),{retryAt:attempts[0]+3_600_000});
 attempts.push(now);localStorage.setItem(budgetKey,JSON.stringify(attempts));
 const headers:Record<string,string>={'Accept':'application/vnd.github+json'};if(saved?.etag)headers['If-None-Match']=saved.etag;
 const response=await fetch(`https://api.github.com/repos/${repo}/releases?per_page=20`,{headers});
 const remainingHeader=response.headers.get('x-ratelimit-remaining'),resetHeader=response.headers.get('x-ratelimit-reset'),remaining=remainingHeader===null?null:Number(remainingHeader),reset=resetHeader===null?null:Number(resetHeader);
 if(response.status===304){localStorage.setItem(key,JSON.stringify({...saved,checkedAt:now,remaining,reset}));return {items:saved.items as unknown[],remaining,reset};}
 if(response.status===403||response.status===429)throw Object.assign(new Error('Límite público de GitHub alcanzado.'),{retryAt:reset&&reset>0?reset*1000:Date.now()+3_600_000,remaining,reset});
 if(!response.ok)throw new Error(`GitHub respondió ${response.status} para ${repo}.`);
 const items=await response.json() as unknown[];localStorage.setItem(key,JSON.stringify({etag:response.headers.get('etag'),items,checkedAt:now,remaining,reset}));return {items,remaining,reset};
}
function event(repo:string,x:Record<string,unknown>):RadarEvent {const tag=String(x.tag_name??''),published=String(x.published_at??x.created_at??'');return {id:String(x.id),repo,kind:'release',title:String(x.name||tag||'Release'),body:String(x.body??'').slice(0,6000),url:String(x.html_url),date:published,sourceUpdated:String(x.updated_at??published),revision:String(x.updated_at??published),status:x.prerelease?'prerelease':'published',assets:Array.isArray(x.assets)?x.assets.length:0,firstSeen:new Date().toISOString(),detectedAt:new Date().toISOString(),read:false,releaseTag:tag,downloads:releaseDownloads(repo,tag,x.assets)};}
export function useRadar(){const [state,setState]=useState<State>(blank),[user,setUser]=useState<typeof auth.currentUser>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[syncing,setSyncing]=useState(false),[waiting]=useState(false),[rateRetryAt,setRateRetryAt]=useState<number|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[authRequired,setAuthRequired]=useState(true),[refreshTargetId,setRefreshTargetId]=useState<string|null>(null);
 const loadSnapshot=useCallback(async()=>{if(!user)return blank;const data=await readLibrary(user.uid);const next={...blank,...data};setState(next);return next;},[user]);
 const refresh=useCallback(async(job:RefreshJob={})=>{if(!user)return;setSyncing(true);setRefreshTargetId(job.targetId??null);try{const library=await readLibrary(user.uid);setState({...blank,...library});const targets=job.targetId?library.targets.filter(t=>t.id===job.targetId):library.targets;let remaining:number|null=null,reset:number|null=null;let githubUsed=false,githubBlocked=false;for(const target of targets){for(const repo of target.repos){try{const prior=library.releases.filter(e=>e.repo.toLowerCase()===repo.toLowerCase()),knownIds=Object.fromEntries(prior.filter(e=>e.releaseTag).map(e=>[e.releaseTag as string,e.id]));let items=await fromQuiver(repo,job.fresh===true,knownIds) as Record<string,unknown>[]|null;if(!items){if(githubBlocked)continue;if(githubUsed)await new Promise(resolve=>setTimeout(resolve,1100));githubUsed=true;const result=await github(repo,job.fresh===true);remaining=result.remaining;reset=result.reset;items=result.items as Record<string,unknown>[];}
 // Misma release vista desde otra fuente: conserva su revisión para no marcarla como nueva.
 const byId=new Map(prior.map(e=>[e.id,e]));const batch=items.map(x=>{const ev=event(repo.toLowerCase(),x),old=byId.get(ev.id);return old&&old.releaseTag===ev.releaseTag?{...ev,revision:old.revision}:ev;}),merged=mergeEvents(prior,batch,new Date().toISOString());for(const e of merged)await setDoc(doc(db,'users',user.uid,'events',encodeURIComponent(e.id)),e,{merge:true});}catch(e){const err=e as Error&{retryAt?:number;remaining?:number;reset?:number};if(err.retryAt){setRateRetryAt(err.retryAt);remaining=err.remaining??null;reset=err.reset??null;githubBlocked=true;continue;}setError(err.message);}}}setState({...blank,...await readLibrary(user.uid)});setState(s=>({...s,rate:{remaining,limit:60,reset,blockedUntil:null},lastSync:{at:new Date().toISOString(),errors:[],repos:[]}}));}catch(e){setError(e instanceof Error?e.message:'Falló la consulta de GitHub.');}finally{setSyncing(false);setRefreshTargetId(null);}},[user]);
 const refreshRef=useRef(refresh),retryRef=useRef<number|null>(rateRetryAt);useEffect(()=>{refreshRef.current=refresh;retryRef.current=rateRetryAt;},[refresh,rateRetryAt]);
 // Versión de escritorio: la credencial llega desde el navegador del sistema (ver lib/desktop-auth.ts).
 useEffect(()=>window.radarDesktop?.onAuthCredential(c=>{setError('');void signInWithDesktopCredential(c).catch(e=>setError(e instanceof Error?e.message:'No se pudo iniciar sesión.'));}),[]);
 useEffect(()=>onAuthStateChanged(auth,u=>{setUser(u);setAuthRequired(!u);if(!u){setState(blank);setLoading(false);}else void readLibrary(u.uid).then(data=>{setState({...blank,...data});setLoading(false);}).catch(e=>{setError(e.message);setLoading(false);});}),[]);
 useEffect(()=>{if(!user)return;const q=createRefreshQueue({run:async job=>{await refreshRef.current?.(job);return {busy:false,rateLimited:!!retryRef.current,retryAt:retryRef.current??undefined,errors:[],repos:[],added:0,changed:0};},status:s=>setSyncing(s!=='idle'),error:e=>setError(e instanceof Error?e.message:'No se pudo actualizar.')});q.request({silent:true,fresh:true});const visibility=()=>{if(document.visibilityState==='visible')q.request({silent:true});};document.addEventListener('visibilitychange',visibility);return()=>{q.dispose();document.removeEventListener('visibilitychange',visibility);};},[user]);
 const act=useCallback<Act>(async(body)=>{if(!user)return false;setBusy(true);setError('');try{if(body.action==='refresh'){void refresh({targetId:typeof body.targetId==='string'?body.targetId:undefined});return true;}if(body.action==='add'){const parsed=parseTarget(String(body.input??''));const id=crypto.randomUUID();let repos=[parsed.key];if(parsed.kind==='org'){const res=await fetch(`https://api.github.com/orgs/${parsed.key}/repos?per_page=100`);if(!res.ok)throw new Error('No se pudo consultar la organización.');repos=(await res.json() as Record<string,unknown>[]).filter(r=>!r.fork&&!r.archived).slice(0,6).map(r=>`${parsed.key}/${String(r.name)}`);}const target:Target={id,key:parsed.key,kind:parsed.kind,label:String(body.label||parsed.key),priority:0,repos,createdAt:new Date().toISOString(),lastSync:null,error:null};await saveTarget(user.uid,target);setState({...blank,...await readLibrary(user.uid)});void refresh({targetId:id});}
 else if(body.action==='setInstalled'){const repo=String(body.repo),releaseId=String(body.releaseId??''),ev=state.releases.find(e=>e.id===releaseId&&e.repo===repo);await saveInstallation(user.uid,ev?installationFromRelease(ev,new Date().toISOString()):manualInstallation(repo,String(body.tag??''),new Date().toISOString()));await loadSnapshot();}
 else if(body.action==='priority'){const target=state.targets.find(t=>t.id===String(body.id));if(target)await setTargetPriority(user.uid,target.id,body.priority?1:0);await loadSnapshot();}
 else if(body.action==='remove'){await removeTarget(user.uid,String(body.id));await loadSnapshot();}
 else if(body.action==='clearInstalled'){await deleteInstallation(user.uid,String(body.repo));await loadSnapshot();}
 else if(body.action==='markRead'){const e=state.events.find(e=>e.id===String(body.id));if(e)await setDoc(doc(db,'users',user.uid,'events',encodeURIComponent(e.id)),{...e,read:true});await loadSnapshot();}
 else throw new Error('Acción no disponible en el cliente.');return true;}catch(e){setError(e instanceof Error?e.message:'No se pudo completar.');return false;}finally{setBusy(false);}},[user,state,refresh,loadSnapshot]);
 const reload=useCallback(async()=>{await loadSnapshot();},[loadSnapshot]);
 return {state,loading,busy,syncing,waiting,rateRetryAt,refreshTargetId,error,setError,notice,setNotice,auth:authRequired,act,loadSnapshot:reload,user,firebaseConfigured,login:async(provider:'github'|'google')=>{if(window.radarDesktop){await window.radarDesktop.startLogin(provider);setNotice('Continúa en tu navegador. Al terminar, vuelve a Recomp Radar.');return;}await signInWithPopup(auth,provider==='github'?githubProvider:googleProvider);},logout:()=>signOut(auth),importJSON:async(raw:unknown)=>{if(!user)throw new Error('Inicia sesión.');await importLibrary(user.uid,importMapping(raw));await reload();},saveCover:async(repo:string,value:{url?:string;dataUrl?:string;dataUrl2x?:string})=>{if(!user)throw new Error('Inicia sesión.');await saveCover(user.uid,repo,value);await reload();}};
}
