import {env} from 'cloudflare:workers';
import {CACHE_MS,fingerprint,rateFromHeaders,type RadarEvent} from './domain';
export class GithubError extends Error {constructor(message:string,public status=502){super(message)}}
export type Rate={remaining:number|null;limit:number|null;reset:number|null;blockedUntil:number|null};
const db=()=>{if(!env.DB)throw new Error('La base de datos no está disponible.');return env.DB;};
export async function getRate():Promise<Rate>{const row=await db().prepare("SELECT value FROM settings WHERE key='github-rate'").first<{value:string}>();return row?JSON.parse(row.value):{remaining:null,limit:null,reset:null,blockedUntil:null};}
export async function github<T>(path:string,fresh=false):Promise<T>{
 const cached=await db().prepare('SELECT * FROM cache WHERE path=?').bind(path).first<{json:string;etag:string;checked_at:number}>();const now=Date.now();
 if(cached&&now-cached.checked_at<(fresh?5*60*1000:CACHE_MS))return JSON.parse(cached.json);
 const rate=await getRate();if(rate.blockedUntil&&rate.blockedUntil>now)throw new GithubError('GitHub está en pausa por límite de peticiones. Intenta después de '+new Date(rate.blockedUntil).toLocaleTimeString('es')+'.',429);
 if(rate.remaining!==null&&rate.remaining<3&&rate.reset&&rate.reset*1000>now)throw new GithubError('Quedan pocas peticiones de GitHub. La sincronización se reanudará tras el reinicio del límite.',429);
 let response:Response;try{response=await fetch('https://api.github.com'+path,{headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2026-03-10','User-Agent':'RecompRadar/1.0',...(cached?.etag?{'If-None-Match':cached.etag}:{})},signal:AbortSignal.timeout(10000),redirect:'follow'})}catch{throw new GithubError('No se pudo contactar con GitHub. Tus datos guardados siguen disponibles.');}
 const next:Rate=rateFromHeaders(response.status,response.headers,now);
 await db().prepare("INSERT INTO settings(key,value) VALUES('github-rate',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(JSON.stringify(next)).run();
 if(response.status===304&&cached){await db().prepare('UPDATE cache SET checked_at=? WHERE path=?').bind(now,path).run();return JSON.parse(cached.json);}
 if(response.status===404)throw new GithubError('GitHub no encontró ese recurso público. Comprueba el nombre; repos privados no son compatibles.',404);
 if(response.status===409)return [] as T;
 if(response.status===403||response.status===429)throw new GithubError('GitHub limitó las peticiones. La app conserva el historial y respeta la pausa.',429);
 if(!response.ok)throw new GithubError('GitHub respondió con un error ('+response.status+'). Intenta más tarde.');
 const data=await response.json(); await db().prepare('INSERT INTO cache(path,json,etag,checked_at) VALUES(?,?,?,?) ON CONFLICT(path) DO UPDATE SET json=excluded.json,etag=excluded.etag,checked_at=excluded.checked_at').bind(path,JSON.stringify(data),response.headers.get('etag'),now).run();return data as T;
}
type Raw=Record<string,any>;
export async function normalize(repo:string,kind:RadarEvent['kind'],raw:Raw):Promise<RadarEvent>{
 const title=kind==='commit'?String(raw.commit?.message??'Commit').split('\n')[0]:String(raw.name||raw.title||raw.tag_name||'Sin título');
 const body=String(kind==='commit'?raw.commit?.message??'':raw.body??'').slice(0,6000);
 const status=kind==='release'?(raw.prerelease?'prerelease':'published'):kind==='pr'?(raw.merged_at?'merged':raw.draft?'draft':raw.state??'open'):'code';
 const assets=kind==='release'?(raw.assets??[]).length:0;
 const revision=await fingerprint({title,body,status,assets:kind==='release'?(raw.assets??[]).map((a:Raw)=>[a.id,a.name,a.size,a.updated_at]):null});
 return {id:`${repo}:${kind}:${raw.id??raw.sha}`,repo,kind,title,body,url:raw.html_url,date:kind==='release'?(raw.published_at??''):kind==='commit'?(raw.commit?.committer?.date??raw.commit?.author?.date):raw.created_at,sourceUpdated:raw.updated_at??null,revision,status,assets,releaseTag:kind==='release'?String(raw.tag_name??'')||null:null,firstSeen:'',detectedAt:'',read:false};
}
export async function syncRepo(repo:string,fresh=false):Promise<RadarEvent[]>{const output:RadarEvent[]=[];for(const kind of ['release','commit','pr'] as const){const endpoint=kind==='release'?'/releases?per_page=20':kind==='commit'?'/commits?per_page=30':'/pulls?state=all&sort=updated&direction=desc&per_page=30';const rows=await github<Raw[]>(`/repos/${repo}${endpoint}`,fresh);for(const row of rows){if(row.draft&&kind==='release')continue;output.push(await normalize(repo,kind,row));}}return output;}
