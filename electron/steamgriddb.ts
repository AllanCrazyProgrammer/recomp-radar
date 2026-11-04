// Cliente de SteamGridDB en el proceso principal. La clave se cifra con el llavero del sistema
// (safeStorage) y nunca se envía a la ventana; la ventana solo recibe URLs del CDN ya validadas.
import {safeStorage} from 'electron';
import {readFile,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {SGDB_API,acronym,bestGame,bestImage,fresh,gridQuery,parseGames,parseImages,repoHints,validKey,type SgdbArt,type SgdbEntry,type SgdbGame} from '../lib/steamgriddb.ts';

const USER_AGENT='RecompRadar-Desktop/1.0';

export function createSteamGridDb(rootDir:string){
 const keyFile=join(rootDir,'steamgriddb.key'),cacheFile=join(rootDir,'steamgriddb-cache.json');
 let key:string|null|undefined,cache:Record<string,SgdbEntry>|null=null;
 let queue:Promise<unknown>=Promise.resolve();

 async function loadKey():Promise<string|null>{
  if(key!==undefined)return key;
  try{key=safeStorage.decryptString(await readFile(keyFile));}catch{key=null;}
  return key;
 }
 async function loadCache(){
  if(cache)return cache;
  try{cache=JSON.parse(await readFile(cacheFile,'utf8'));}catch{cache={};}
  return cache!;
 }
 const saveCache=()=>writeFile(cacheFile,JSON.stringify(cache));

 async function api(path:string,k:string){
  const response=await fetch(SGDB_API+path,{headers:{Authorization:'Bearer '+k,'User-Agent':USER_AGENT,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(15_000)});
  if(response.status===401||response.status===403)throw Object.assign(new Error('SteamGridDB rechazó la clave API. Copia de nuevo la clave desde steamgriddb.com → Preferences → API.'),{auth:true});
  if(response.status===404)return {data:[]};
  if(response.status===429)throw new Error('SteamGridDB pidió esperar un poco (límite de peticiones).');
  if(!response.ok)throw new Error('SteamGridDB respondió '+response.status+'.');
  return response.json() as Promise<unknown>;
 }

 async function setKey(value:string){
  const k=value.trim();
  if(!validKey(k))throw new Error('La clave de SteamGridDB son 32 caracteres hexadecimales.');
  if(!safeStorage.isEncryptionAvailable())throw new Error('Este sistema no ofrece cifrado seguro para guardar la clave.');
  await api('/search/autocomplete/'+encodeURIComponent('zelda'),k); // Verifica la clave antes de guardarla.
  await writeFile(keyFile,safeStorage.encryptString(k),{mode:0o600});
  key=k;
  // Los juegos sin arte se reintentan con la clave nueva.
  const c=await loadCache();for(const r of Object.keys(c))if(!c[r].art)delete c[r];await saveCache();
  return true;
 }
 async function clearKey(){await rm(keyFile,{force:true});key=null;return true;}
 async function status(){return {configured:!!(await loadKey())};}

 /** Prueba los términos en orden hasta un nombre exacto o unas siglas del repo; si no, el mejor del primero. */
 async function findGame(terms:string[],hints:string[],k:string):Promise<{game:SgdbGame;term:string}|null>{
  const norm=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]+/g,'');
  // Sin coincidencia fuerte, junta los candidatos de todas las búsquedas y los compara con el primer término
  // (el título del usuario): "Halo CE" no devuelve "Halo: Combat Evolved", pero "Halo" sí.
  const all:SgdbGame[]=[];
  for(const term of terms){
   const games=parseGames(await api('/search/autocomplete/'+encodeURIComponent(term),k));
   const strong=games.find(g=>norm(g.name)===norm(term))??games.find(g=>hints.includes(acronym(g.name)));
   if(strong)return {game:strong,term};
   for(const g of games)if(!all.some(x=>x.id===g.id))all.push(g);
  }
  const best=bestGame(all,terms[0]??'',hints);
  return best?{game:best,term:terms[0]}:null;
 }

 async function lookup(terms:string[],hints:string[],k:string):Promise<SgdbArt|null>{
  const found=await findGame(terms,hints,k);
  if(!found)return null;
  const {game,term}=found;
  const [portrait,landscape,hero,icon]=await Promise.all([
   api(`/grids/game/${game.id}?${gridQuery.portrait}`,k),
   api(`/grids/game/${game.id}?${gridQuery.landscape}`,k),
   api(`/heroes/game/${game.id}?${gridQuery.hero}`,k),
   api(`/icons/game/${game.id}?${gridQuery.icon}`,k),
  ]).then(r=>r.map(body=>bestImage(parseImages(body))));
  if(!portrait&&!landscape&&!hero&&!icon)return null;
  return {gameId:game.id,name:game.name,term,fetchedAt:new Date().toISOString(),portrait,landscape,hero,icon};
 }

 /** Devuelve el arte de un juego (de la caché si es reciente). Una búsqueda a la vez para no saturar la API. */
 function art(repo:string,terms:string[],options:{force?:boolean;override?:string|null}={}):Promise<SgdbEntry>{
  const run=async():Promise<SgdbEntry>=>{
   const c=await loadCache(),id=repo.toLowerCase(),prior=c[id];
   const override=options.override===undefined?prior?.term??null:options.override;
   if(!options.force&&options.override===undefined&&fresh(prior,Date.now()))return prior!;
   const k=await loadKey();
   if(!k)return {repo,art:null,checkedAt:0,term:override,error:null};
   const candidates=override?[override]:terms;
   let found:SgdbArt|null=null;
   try{found=await lookup(candidates,repoHints(repo),k);}
   catch(e){return {repo,art:prior?.art??null,checkedAt:prior?.checkedAt??0,term:override,error:e instanceof Error?e.message:'Error de SteamGridDB.'};}
   const entry:SgdbEntry={repo,art:found,checkedAt:Date.now(),term:override,error:null};
   c[id]=entry;await saveCache();return entry;
  };
  const next=queue.then(run,run);queue=next.catch(()=>{});return next;
 }

 return {setKey,clearKey,status,art};
}
