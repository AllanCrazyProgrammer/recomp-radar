// Cliente de solo lectura del catálogo público de Quiver Launcher (api.quiverlauncher.com).
// Recomp Radar no está afiliado a Quiver: la interfaz siempre atribuye el catálogo y enlaza a su ficha.
// Todo lo que llega se valida aquí; URLs de imágenes solo de hosts conocidos y enlaces solo https.

export const QUIVER_API='https://api.quiverlauncher.com/api/v1';
export const QUIVER_FALLBACK_API='https://famous-wildebeest-660.convex.site/api/v1';
export const QUIVER_SITE='https://quiverlauncher.com';

export type CatalogOs='windows'|'linux'|'macos'|'android'|'ios';
export type CatalogSort='rating'|'updated'|'added'|'name';
export type CatalogType='port'|'tool'|'emulator'|'game';
export type CatalogQuery={search?:string;os?:CatalogOs|null;console?:string|null;projectType?:CatalogType|null;sort?:CatalogSort;hideGenerated?:boolean;cursor?:string|null;limit?:number};
export type CatalogArt={capsule:string|null;header:string|null;hero:string|null;logo:string|null;icon:string|null};
export type CatalogEntry={
 slug:string;name:string;projectName:string;description:string;games:string[];consoles:string[];
 projectType:CatalogType;aiLevel:'none'|'assisted'|'generated'|null;supportedOS:CatalogOs[];
 lastReleaseVersion:string|null;lastReleaseAt:number|null;addedAt:number|null;
 recommended:number;reportIssues:number;reportBroken:number;tags:string[];developer:string|null;art:CatalogArt;
};
export type CatalogPage={items:CatalogEntry[];nextCursor:string|null};
export type CatalogConsole={id:string;name:string;brand:string};
export type CatalogDetail={entry:CatalogEntry;provider:string;repository:string|null;website:string|null;author:string|null;year:number|null;gameTitle:string|null};

const OS:CatalogOs[]=['windows','linux','macos','android','ios'];
const TYPES:CatalogType[]=['port','tool','emulator','game'];
const IMAGE_HOSTS=new Set(['cdn2.steamgriddb.com','raw.githubusercontent.com','user-images.githubusercontent.com','avatars.githubusercontent.com']);
const str=(v:unknown,max=2000)=>typeof v==='string'?v.slice(0,max):'';
const num=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:0;

export function safeImage(value:unknown):string|null{
 if(typeof value!=='string'||value.length>600)return null;
 try{const u=new URL(value);return u.protocol==='https:'&&IMAGE_HOSTS.has(u.hostname)&&!u.username&&!u.password?u.href:null;}catch{return null;}
}
export function safeLink(value:unknown):string|null{
 if(typeof value!=='string'||value.length>600)return null;
 try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}
}

export function appsPath(q:CatalogQuery):string{
 const p=new URLSearchParams({limit:String(Math.min(Math.max(q.limit??24,1),48))});
 if(q.search?.trim())p.set('search',q.search.trim().slice(0,80));
 if(q.os)p.set('os',q.os);
 if(q.projectType)p.set('projectType',q.projectType);
 if(q.console?.startsWith('maker:'))p.set('maker',q.console.slice(6));else if(q.console)p.set('console',q.console);
 if(q.sort)p.set('sort',q.sort);
 if(q.hideGenerated)p.set('ai','no-generated');
 if(q.cursor)p.set('cursor',q.cursor);
 return '/apps?'+p.toString();
}

export function parseEntry(value:unknown):CatalogEntry|null{
 if(!value||typeof value!=='object')return null;
 const v=value as Record<string,unknown>;
 const slug=str(v.slug,200);
 if(!/^[a-z0-9][a-z0-9-]*$/.test(slug)||typeof v.name!=='string')return null;
 const art=(v.libraryArt&&typeof v.libraryArt==='object'?v.libraryArt:{}) as Record<string,unknown>;
 const list=(x:unknown,max=20)=>Array.isArray(x)?x.filter((s):s is string=>typeof s==='string').slice(0,max):[];
 return {
  slug,name:str(v.name,200),projectName:str(v.projectName,200)||str(v.name,200),description:str(v.description,1200),
  games:Array.isArray(v.games)?v.games.map(g=>str((g as Record<string,unknown>)?.title,200)).filter(Boolean).slice(0,6):[],
  consoles:list(v.consoles,8),projectType:TYPES.includes(v.projectType as CatalogType)?v.projectType as CatalogType:'port',
  aiLevel:v.aiLevel==='none'||v.aiLevel==='assisted'||v.aiLevel==='generated'?v.aiLevel:null,
  supportedOS:list(v.supportedOS).map(s=>s.toLowerCase()).filter((s):s is CatalogOs=>OS.includes(s as CatalogOs)),
  lastReleaseVersion:str(v.lastReleaseVersion,80)||null,lastReleaseAt:num(v.lastReleaseAt)||null,addedAt:num(v.addedAt)||null,
  recommended:num(v.recommended),reportIssues:num(v.reportIssues),reportBroken:num(v.reportBroken),tags:list(v.tags,16),
  developer:str((v.developer as Record<string,unknown>)?.name,80)||null,
  art:{capsule:safeImage(art.capsule),header:safeImage(art.header),hero:safeImage(art.hero),logo:safeImage(art.logo),icon:safeImage(v.artwork)},
 };
}

export function parsePage(value:unknown):CatalogPage{
 const v=(value??{}) as Record<string,unknown>;
 const items=Array.isArray(v.items)?v.items.map(parseEntry).filter((e):e is CatalogEntry=>!!e):[];
 return {items,nextCursor:typeof v.nextCursor==='string'&&v.nextCursor.length<2000&&v.isDone!==true?v.nextCursor:null};
}

export function parseConsoles(value:unknown):CatalogConsole[]{
 const list=(value as Record<string,unknown>)?.consoles;
 return Array.isArray(list)?list.map(c=>c as Record<string,unknown>).filter(c=>typeof c.id==='string'&&typeof c.name==='string').map(c=>({id:c.id as string,name:c.name as string,brand:str(c.brand,40)||'Otros'})):[];
}

export function parseDetail(value:unknown):CatalogDetail|null{
 const v=(value??{}) as Record<string,unknown>;
 const entry=parseEntry(v.entry);if(!entry)return null;
 const project=(v.project??{}) as Record<string,unknown>,game=(v.game??{}) as Record<string,unknown>;
 const repository=typeof project.repository==='string'&&/^[\w.-]+\/[\w.-]+$/.test(project.repository)&&!project.repository.split('/').some(p=>p==='.'||p==='..')?project.repository:null;
 return {entry,provider:str(project.provider,20)||'github',repository,website:safeLink(project.website),author:str(project.author,80)||null,year:typeof game.year==='number'?game.year:null,gameTitle:str(game.title,200)||null};
}

/** Lo que dicen los jugadores, en una frase. Los "con problemas" cuentan medio. */
export function playerVerdict(e:Pick<CatalogEntry,'recommended'|'reportIssues'|'reportBroken'>):{label:string;tone:'good'|'mixed'|'bad'|'none'}{
 const total=e.recommended+e.reportIssues+e.reportBroken;
 if(!total)return {label:'Sin opiniones de jugadores',tone:'none'};
 const share=(e.recommended+e.reportIssues/2)/total;
 const who=total===1?'1 jugador':total+' jugadores';
 if(share>=0.75)return {label:'Funciona bien · '+who,tone:'good'};
 if(share>=0.45)return {label:'Funciona con problemas · '+who,tone:'mixed'};
 return {label:'Suele fallar · '+who,tone:'bad'};
}

export const aiLabel=(level:CatalogEntry['aiLevel'])=>level==='generated'?'Mayormente IA':level==='assisted'?'Asistido por IA':null;
export const osLabel:Record<CatalogOs,string>={windows:'Windows',linux:'Linux',macos:'macOS',android:'Android',ios:'iOS'};
export const typeLabel:Record<CatalogType,string>={port:'Ports y recomps',tool:'Herramientas',emulator:'Emuladores',game:'Juegos'};
export const sortLabel:Record<CatalogSort,string>={rating:'Mejor valorados',updated:'Recién actualizados',added:'Recién añadidos',name:'Nombre (A–Z)'};
export const appPage=(slug:string)=>`${QUIVER_SITE}/apps/${encodeURIComponent(slug)}`;

/** Petición con tiempo límite; si el dominio principal no responde, prueba el host directo de Quiver. */
export async function catalogGet(path:string,request:typeof fetch=fetch):Promise<unknown>{
 const once=async(base:string)=>{const r=await request(base+path,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(20_000)});if(!r.ok)throw Object.assign(new Error('El catálogo de Quiver respondió '+r.status+'.'),{status:r.status});return r.json() as Promise<unknown>;};
 try{return await once(QUIVER_API);}
 catch(e){if((e as {status?:number}).status)throw e;return once(QUIVER_FALLBACK_API);}
}
