// Versiones desde el catálogo de Quiver Launcher, como hace Quiver: su servidor vigila los repositorios
// y sirve el resultado en caché a todos, así que no se gasta la cuota de GitHub de cada usuario.
// Recomp Radar no está afiliado a Quiver. Solo se usa para repositorios de GitHub que estén en su catálogo;
// el resto sigue consultándose en GitHub.
import {catalogGet} from './quiver-catalog.ts';
import {validRepo} from './desktop-install.ts';

export const INDEX_TTL_MS=6*3600_000;
export type QuiverIndex={at:number;slugs:Record<string,string>};
/** Forma de una release de la API de GitHub que entiende el resto de la app (hooks/use-radar.ts → event()). */
export type GithubLikeRelease={id:string;tag_name:string;name:string;body:string;html_url:string;published_at:string;updated_at:string;prerelease:boolean;assets:{name:string;size:number;browser_download_url:string;state:string}[]};

/** owner/repo de GitHub → slug del catálogo, a partir de una página de /release-status. */
export function indexPage(value:unknown,into:Record<string,string>={}):{slugs:Record<string,string>;next:string|null}{
 const v=(value??{}) as {items?:unknown;nextCursor?:unknown;isDone?:unknown};
 for(const raw of Array.isArray(v.items)?v.items:[]){
  const e=(raw??{}) as Record<string,unknown>;
  if(e.provider!=='github'||typeof e.repository!=='string'||typeof e.slug!=='string')continue;
  if(!validRepo(e.repository)||!/^[a-z0-9][a-z0-9-]*$/.test(e.slug))continue;
  const withdrawn=Array.isArray(e.withdrawn)&&e.withdrawn.length>0&&!e.verified;
  if(!withdrawn)into[e.repository.toLowerCase()]=e.slug;
 }
 return {slugs:into,next:v.isDone!==true&&typeof v.nextCursor==='string'?v.nextCursor:null};
}

export async function loadIndex(get:(path:string)=>Promise<unknown>=catalogGet,maxPages=30):Promise<QuiverIndex>{
 let cursor:string|null=null,pages=0;const slugs:Record<string,string>={};
 do{const page=indexPage(await get('/release-status?limit=100'+(cursor?'&cursor='+encodeURIComponent(cursor):'')),slugs);cursor=page.next;pages++;}while(cursor&&pages<maxPages);
 return {at:Date.now(),slugs};
}

/**
 * Convierte /apps/{slug}/release-history al formato de GitHub. Reutiliza el id de una release ya guardada
 * con la misma etiqueta para no duplicarla al cambiar de fuente.
 */
export function toGithubReleases(repo:string,value:unknown,knownIds:Record<string,string>={}):GithubLikeRelease[]{
 const items=(value as {items?:unknown})?.items;
 if(!Array.isArray(items))return [];
 const out:GithubLikeRelease[]=[];
 for(const raw of items.slice(0,20)){
  const r=(raw??{}) as Record<string,unknown>;
  if(typeof r.version!=='string'||!r.version||r.version.length>120||typeof r.releasedAt!=='number')continue;
  if(r.state==='blocked')continue; // Quiver la bloqueó (p. ej. archivos que no coinciden); no la mostramos como versión.
  const tag=r.version,date=new Date(r.releasedAt).toISOString();
  const upstream=typeof r.upstreamUrl==='string'&&r.upstreamUrl.toLowerCase().startsWith(`https://github.com/${repo.toLowerCase()}/releases/`)?r.upstreamUrl:`https://github.com/${repo}/releases/tag/${encodeURIComponent(tag)}`;
  const assets=(Array.isArray(r.assets)?r.assets:[]).map(a=>(a??{}) as Record<string,unknown>).filter(a=>typeof a.filename==='string'&&typeof a.url==='string').map(a=>({name:a.filename as string,size:typeof a.size==='number'?a.size:0,browser_download_url:a.url as string,state:'uploaded'}));
  out.push({id:knownIds[tag]??'quiver:'+String(r.releaseId??tag),tag_name:tag,name:tag,body:typeof r.notes==='string'?r.notes:'',html_url:upstream,published_at:date,updated_at:date,prerelease:r.prerelease===true,assets});
 }
 return out;
}
