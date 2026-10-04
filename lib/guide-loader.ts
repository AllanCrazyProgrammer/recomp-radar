import {GithubError,GithubRateLimitError} from './github-rate.ts';
import {GUIDE_CACHE_MS,extractGuide,linkedGuidePaths,type GuideDocument,type RepositoryGuide} from './repository-guide.ts';
import type {GithubFetch} from './github-data.ts';
type File={type?:string;encoding?:string;content?:string;size?:number;path?:string;html_url?:string};
type Dependencies={db:D1Database;github:GithubFetch;now?:()=>number};
const pending=new WeakMap<D1Database,Map<string,Promise<RepositoryGuide>>>();

function decode(file:File,repo:string,ref:string|null):GuideDocument|null{
 if(file.type!=='file'||file.encoding!=='base64'||!file.content||!file.path||(file.size??0)>200000)return null;
 const url=file.html_url;
 if(!url||!url.startsWith(`https://github.com/${repo}/blob/`))return null;
 try{const bytes=Uint8Array.from(atob(file.content.replace(/\s/g,'')),c=>c.charCodeAt(0));if(bytes.length>200000)return null;
  return {path:file.path,url,ref,markdown:new TextDecoder().decode(bytes)};
 }catch{return null;}
}

export async function loadRepositoryGuide(deps:Dependencies,repo:string,tag:string|null):Promise<RepositoryGuide>{
 const key='project-guide:v1:'+repo.toLowerCase()+':'+(tag??'default');
 let jobs=pending.get(deps.db);if(!jobs){jobs=new Map();pending.set(deps.db,jobs);}
 const existing=jobs.get(key);if(existing)return existing;
 const job=load(deps,repo,tag,key);jobs.set(key,job);
 try{return await job;}finally{jobs.delete(key);}
}

async function load({db,github,now=Date.now}:Dependencies,repo:string,tag:string|null,key:string):Promise<RepositoryGuide>{
 const time=now(),cached=await db.prepare('SELECT json,checked_at FROM cache WHERE path=?').bind(key).first<{json:string;checked_at:number}>();
 let saved:RepositoryGuide|null=null;try{if(cached)saved=JSON.parse(cached.json);}catch{/* Refetch corrupted legacy data. */}
 if(saved&&cached&&time-cached.checked_at<GUIDE_CACHE_MS)return saved;
 let ref=tag,deferred:GithubRateLimitError|null=null;const documents:GuideDocument[]=[];
 async function read(path:string):Promise<File|null>{try{return await github<File>(path,false,GUIDE_CACHE_MS);}catch(e){if(e instanceof GithubError&&e.status===404)return null;if(e instanceof GithubRateLimitError&&e.cachedData){deferred=e;return e.cachedData as File;}throw e;}}
 try{
  let file=await read('/repos/'+repo+'/readme'+(tag?'?ref='+encodeURIComponent(tag):''));
  if(!file&&tag){ref=null;file=await read('/repos/'+repo+'/readme');}
  if(file){
   // Default-branch fallback is labeled current documentation, never the selected tag.
   const actualRef=ref??file.html_url?.split('/blob/')[1]?.split('/')[0]??null;
   const doc=decode(file,repo,actualRef);if(doc){documents.push(doc);
    for(const path of linkedGuidePaths(doc,repo)){
     const extra=await read('/repos/'+repo+'/contents/'+path.split('/').map(encodeURIComponent).join('/')+(ref?'?ref='+encodeURIComponent(ref):''));
     if(extra){const linked=decode(extra,repo,actualRef);if(linked)documents.push(linked);}
    }
   }
  }
  const parts=documents.map(extractGuide),guide:RepositoryGuide={repo,tag,ref,checkedAt:new Date(time).toISOString(),install:parts.flatMap(p=>p.install),update:parts.flatMap(p=>p.update),documents};
  if(deferred){const pause=deferred as GithubRateLimitError;return {...guide,stale:true,retryAt:pause.retryAt,notice:'GitHub está en pausa. Estos extractos provienen de documentos guardados anteriormente.'};}
  await db.prepare('INSERT INTO cache(path,json,etag,checked_at) VALUES(?,?,NULL,?) ON CONFLICT(path) DO UPDATE SET json=excluded.json,etag=NULL,checked_at=excluded.checked_at').bind(key,JSON.stringify(guide),time).run();
  return guide;
 }catch(error){
  const retryAt=error instanceof GithubRateLimitError?error.retryAt:undefined;
  const parts=documents.map(extractGuide);
  return {...(saved??{repo,tag,ref,checkedAt:new Date(time).toISOString(),install:parts.flatMap(p=>p.install),update:parts.flatMap(p=>p.update),documents}),stale:true,retryAt,notice:retryAt?'GitHub está en pausa. Se muestra la documentación guardada; las notas de esta release siguen disponibles.':'No se pudo completar la consulta. Se muestra la documentación disponible.'};
 }
}
