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
 // Sin siglas cortas ni números ("Halo CE" → "Halo") para que la búsqueda devuelva el juego completo.
 const base=input.title.split(/\s+/).filter(w=>!/^(?:[A-Z]{2,3}|\d{1,3}|\w{1,2})$/.test(w)).join(' ');
 const raw=[input.override??'',input.title,clean(input.title),base,input.project,clean(repoName)];
 const seen=new Set<string>(),out:string[]=[];
 for(const t of raw.map(s=>s.trim()).filter(s=>s.length>=2&&s.length<=80)){const k=t.toLowerCase();if(!seen.has(k)){seen.add(k);out.push(t);}}
 return out.slice(0,5);
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

/** Iniciales de un nombre: "Conker's Bad Fur Day" → "cbfd". */
export function acronym(name:string):string{
 return name.replace(/'s\b/gi,'').split(/[^a-z0-9]+/i).filter(Boolean).map(w=>/^\d+$/.test(w)?w:w[0]).join('').toLowerCase();
}

/** Palabras del nombre del repositorio que pueden ser siglas del juego (CBFD-Recompiled → ["cbfd", …]). */
export function repoHints(repo:string):string[]{
 return (repo.split('/')[1]??'').split(/[-_.\s]+/).map(w=>w.toLowerCase()).filter(w=>w.length>=3&&w.length<=8);
}

const words=(s:string)=>s.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/'s\b/g,'').split(/[^a-z0-9]+/).filter(Boolean);
// Números cortos y plataformas en el título del usuario ("Xenoblade 1", "Paper Mario 64 3ds") no identifican el juego.
const NOISE=/^(?:\d{1,2}|3ds|ds|n64|gc|wii|ps\d|pc|switch|port|recomp)$/;

/**
 * Parecido entre el título del usuario y un nombre de SteamGridDB: +10 por cada palabra significativa
 * encontrada (también como siglas: "CE" = "Combat Evolved"), −1 por cada palabra que sobra en el nombre.
 */
export function nameScore(term:string,name:string):number{
 const raw=words(term),wanted=raw.filter(w=>!NOISE.test(w)),have=words(name);
 const used=new Set<number>();let score=0;
 for(const w of wanted){
  const i=have.findIndex((h,j)=>!used.has(j)&&h===w);
  if(i>=0){used.add(i);score+=10;continue;}
  // Siglas: "ce" ↔ palabras consecutivas cuyas iniciales forman la sigla.
  let hit=-1;
  for(let j=0;j+w.length<=have.length&&w.length>=2;j++){const span=have.slice(j,j+w.length);if(span.map(h=>h[0]).join('')===w&&span.every((_,k)=>!used.has(j+k))){hit=j;break;}}
  if(hit>=0){for(let k=0;k<w.length;k++)used.add(hit+k);score+=10;}
 }
 const extra=have.filter((h,j)=>!used.has(j)&&!raw.includes(h)).length;
 return score-extra;
}

/** Elige el juego: nombre exacto, siglas del repositorio, y si no, el nombre más parecido al título. */
export function bestGame(games:SgdbGame[],term:string,hints:string[]=[]):SgdbGame|null{
 const norm=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]+/g,'');
 const t=norm(term);
 const exact=games.find(g=>norm(g.name)===t)??games.find(g=>hints.includes(acronym(g.name)));
 if(exact)return exact;
 const ranked=games.map((g,i)=>({g,i,s:nameScore(term,g.name)})).sort((a,b)=>b.s-a.s||Number(b.g.verified)-Number(a.g.verified)||a.i-b.i);
 // Sin ninguna palabra en común, el orden de relevancia de SteamGridDB es mejor pista que el largo del nombre.
 return ranked[0]&&ranked[0].s>0?ranked[0].g:games[0]??null;
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
