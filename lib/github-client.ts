import {CACHE_MS,rateFromHeaders} from './domain.ts';
import {GithubError,GithubRateLimitError,rateResumeAt,type Rate} from './github-rate.ts';

type Dependencies={db:D1Database;fetch?:typeof fetch;now?:()=>number};
export function createGithubClient({db,fetch:request=fetch,now=Date.now}:Dependencies){
  async function getRate():Promise<Rate>{
    const row=await db.prepare("SELECT value FROM settings WHERE key='github-rate'").first<{value:string}>();
    return row?JSON.parse(row.value):{remaining:null,limit:null,reset:null,blockedUntil:null};
  }
  async function github<T>(path:string,fresh=false,cacheMs?:number):Promise<T>{
    const cached=await db.prepare('SELECT * FROM cache WHERE path=?').bind(path).first<{json:string;etag:string;checked_at:number}>();
    const timestamp=now();
    if(cached&&timestamp-cached.checked_at<(cacheMs??(fresh?5*60*1000:CACHE_MS)))return JSON.parse(cached.json);
    const rate=await getRate();
    const resumeAt=rateResumeAt(rate,timestamp);
    // Include old captured data so the sync can restore it without pretending it is fresh.
    if(resumeAt)throw new GithubRateLimitError(resumeAt,cached?JSON.parse(cached.json):undefined);
    let response:Response;
    try{response=await request('https://api.github.com'+path,{headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2026-03-10','User-Agent':'RecompRadar/1.0',...(cached?.etag?{'If-None-Match':cached.etag}:{})},signal:AbortSignal.timeout(10000),redirect:'follow'});}
    catch{throw new GithubError('No se pudo contactar con GitHub. Tus datos guardados siguen disponibles.');}
    const next=rateFromHeaders(response.status,response.headers,timestamp);
    await db.prepare("INSERT INTO settings(key,value) VALUES('github-rate',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(JSON.stringify(next)).run();
    if(response.status===304&&cached){await db.prepare('UPDATE cache SET checked_at=? WHERE path=?').bind(timestamp,path).run();return JSON.parse(cached.json);}
    if(response.status===404)throw new GithubError('GitHub no encontró ese recurso público. Comprueba el nombre; repos privados no son compatibles.',404);
    if(response.status===409)return [] as T;
    if(response.status===403||response.status===429)throw new GithubRateLimitError(next.blockedUntil??timestamp+60000,cached?JSON.parse(cached.json):undefined);
    if(!response.ok)throw new GithubError('GitHub respondió con un error ('+response.status+'). Intenta más tarde.');
    const data=await response.json();
    await db.prepare('INSERT INTO cache(path,json,etag,checked_at) VALUES(?,?,?,?) ON CONFLICT(path) DO UPDATE SET json=excluded.json,etag=excluded.etag,checked_at=excluded.checked_at').bind(path,JSON.stringify(data),response.headers.get('etag'),timestamp).run();
    return data as T;
  }
  return {getRate,github};
}
