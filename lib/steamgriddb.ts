// Portadas automáticas desde SteamGridDB (solo app de escritorio: la clave API nunca llega a la web).
// Lógica pura: términos de búsqueda, elección de la mejor imagen y validación de URLs del CDN.

export const SGDB_API='https://www.steamgriddb.com/api/v2';
export const SGDB_TTL_MS=7*24*3600_000,SGDB_MISS_TTL_MS=24*3600_000;

export type SgdbGame={id:number;name:string;verified:boolean};
export type SgdbImage={id:number;score:number;url:string;thumb:string;width:number;height:number;style:string[]};
/** Arte elegido para un juego. Cada URL ya está validada como cdn2.steamgriddb.com. */
export type SgdbArt={
 gameId:number;name:string;term:string;fetchedAt:string;
 portrait:SgdbPick|null;landscape:SgdbPick|null;hero:SgdbPick|null;icon:SgdbPick|null;
};
export type SgdbPick={url:string;thumb:string};
export type SgdbEntry={repo:string;art:SgdbArt|null;checkedAt:number;term?:string|null;error?:string|null};

const CDN=/^https:\/\/cdn2\.steamgriddb\.com\/(?:grid|hero|icon|logo|thumb)\/[0-9a-f]{16,64}\.(?:png|jpe?g|webp|ico)$/i;
export function validCdnUrl(value:unknown):value is string{return typeof value==='string'&&CDN.test(value);}

/** La clave de SteamGridDB es un hex de 32 caracteres. */
export function validKey(key:string):boolean{return /^[0-9a-f]{32}$/i.test(key.trim());}

/** Términos a probar, de más a menos específico: nombre manual, título del juego, nombre del repositorio. */
export function searchTerms(input:{override?:string|null;title:string;project:string;repo:string}):string[]{
 const clean=(s:string)=>s.replace(/[_-]+/g,' ')
  .replace(/\b(?:recomp(?:iled)?|recompilation|decomp(?:ilation)?|native|port|pc|mobile|open|community|edition|3ds|dualscreen|64)\b/gi,' ')
  .replace(/\s+/g,' ').trim();
 const repoName=input.repo.split('/')[1]??'';
 const raw=[input.override??'',input.title,clean(input.title),input.project,clean(repoName)];
 const seen=new Set<string>(),out:string[]=[];
 for(const t of raw.map(s=>s.trim()).filter(s=>s.length>=2&&s.length<=80)){const k=t.toLowerCase();if(!seen.has(k)){seen.add(k);out.push(t);}}
 return out.slice(0,4);
}

export function parseGames(body:unknown):SgdbGame[]{
 const data=(body as {success?:boolean;data?:unknown})?.data;
 if(!Array.isArray(data))return [];
 return data.filter((g):g is Record<string,unknown>=>!!g&&typeof g==='object').filter(g=>typeof g.id==='number'&&typeof g.name==='string').map(g=>({id:g.id as number,name:g.name as string,verified:g.verified===true}));
}

export function parseImages(body:unknown):SgdbImage[]{
 const data=(body as {data?:unknown})?.data;
 if(!Array.isArray(data))return [];
 const out:SgdbImage[]=[];
 for(const raw of data){
  if(!raw||typeof raw!=='object')continue;
  const i=raw as Record<string,unknown>;
  if(typeof i.id!=='number'||!validCdnUrl(i.url))continue;
  out.push({id:i.id,score:typeof i.score==='number'?i.score:0,url:i.url,thumb:validCdnUrl(i.thumb)?i.thumb:i.url,width:Number(i.width)||0,height:Number(i.height)||0,style:Array.isArray(i.style)?i.style.filter((s):s is string=>typeof s==='string'):[]});
 }
 return out;
}

/** Mejor imagen: más votada; en empate, la de estilo "alternate"/"material" (arte limpio) y luego la más grande. */
export function bestImage(images:SgdbImage[]):SgdbPick|null{
 const clean=(i:SgdbImage)=>i.style.some(s=>s==='alternate'||s==='material')?1:0;
 const best=[...images].sort((a,b)=>b.score-a.score||clean(b)-clean(a)||b.width*b.height-a.width*a.height||a.id-b.id)[0];
 return best?{url:best.url,thumb:best.thumb}:null;
}

/** Elige el juego: coincidencia exacta del nombre, luego verificado, luego el primero de SteamGridDB. */
export function bestGame(games:SgdbGame[],term:string):SgdbGame|null{
 const norm=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]+/g,'');
 const t=norm(term);
 return games.find(g=>norm(g.name)===t)??games.find(g=>g.verified&&norm(g.name).includes(t))??games[0]??null;
}

export function fresh(entry:SgdbEntry|undefined,now:number):boolean{
 if(!entry)return false;
 return now-entry.checkedAt<(entry.art?SGDB_TTL_MS:SGDB_MISS_TTL_MS);
}

export const gridQuery={
 portrait:'dimensions=600x900,342x482,660x930&types=static&nsfw=false&humor=false&epilepsy=false',
 landscape:'dimensions=920x430,460x215&types=static&nsfw=false&humor=false&epilepsy=false',
 hero:'types=static&nsfw=false&humor=false&epilepsy=false',
 icon:'types=static&nsfw=false&humor=false&epilepsy=false',
};
