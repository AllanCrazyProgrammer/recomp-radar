// Instalador del proceso principal: descarga, verifica, extrae de forma segura y lanza juegos.
// Ninguna orden pasa por un shell: todos los procesos usan execFile/spawn con argumentos.
import {createHash,randomUUID} from 'node:crypto';
import {createWriteStream} from 'node:fs';
import {chmod,cp,lstat,mkdir,open,readdir,readFile,readlink,realpath,rename,rm,stat,writeFile} from 'node:fs/promises';
import {execFile,spawn} from 'node:child_process';
import {basename,dirname,join,relative,resolve,sep} from 'node:path';
import {Readable,Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {promisify} from 'node:util';
import {allowedDownloadHost,checksumFor,gameFolderName,installFormat,isInside,parseInstalledGame,pickExecutable,safeArchiveEntry,type DesktopOS,type ExecutableCandidate,type InstallFormat,type InstallProgress,type InstallRequest,type InstalledGame} from '../lib/desktop-install.ts';

const run=promisify(execFile);
const MAX_DOWNLOAD=8*1024**3,MAX_FILES=60_000,MAX_DEPTH=8,MANIFEST='install.json';
const USER_AGENT='RecompRadar-Desktop/1.0';

export function currentOS():DesktopOS{return process.platform==='darwin'?'macOS':process.platform==='win32'?'Windows':'Linux';}

export function createInstaller(rootDir:string){
 const gamesDir=join(rootDir,'games'),stagingDir=join(rootDir,'staging'),os=currentOS();
 const active=new Set<string>();
 const gameDir=(repo:string)=>join(gamesDir,gameFolderName(repo));

 async function readManifest(repo:string):Promise<InstalledGame|null>{
  try{return parseInstalledGame(JSON.parse(await readFile(join(gameDir(repo),MANIFEST),'utf8')));}catch{return null;}
 }
 async function writeManifest(dir:string,game:InstalledGame){await writeFile(join(dir,MANIFEST),JSON.stringify(game,null,2));}

 async function list():Promise<InstalledGame[]>{
  await mkdir(gamesDir,{recursive:true});
  const result:InstalledGame[]=[];
  for(const entry of await readdir(gamesDir,{withFileTypes:true})){
   if(!entry.isDirectory()||entry.name.includes('.old-'))continue;
   try{const game=parseInstalledGame(JSON.parse(await readFile(join(gamesDir,entry.name,MANIFEST),'utf8')));if(game)result.push(game);}catch{/* Carpeta sin manifiesto: instalación incompleta. */}
  }
  return result;
 }

 /** Sigue redirecciones a mano para que cada salto quede dentro de los hosts de GitHub. */
 async function request(url:string,accept='application/octet-stream'):Promise<Response>{
  let current=url;
  for(let hop=0;hop<6;hop++){
   const u=new URL(current);
   if(u.protocol!=='https:'||!allowedDownloadHost(u.hostname))throw new Error('La descarga intentó salir de GitHub ('+u.hostname+').');
   const response=await fetch(current,{redirect:'manual',headers:{'User-Agent':USER_AGENT,Accept:accept},signal:AbortSignal.timeout(60_000)});
   if(response.status>=300&&response.status<400){const next=response.headers.get('location');if(!next)break;current=new URL(next,current).href;continue;}
   if(!response.ok)throw new Error('GitHub respondió '+response.status+' al descargar.');
   return response;
  }
  throw new Error('Demasiadas redirecciones al descargar.');
 }

 async function download(req:InstallRequest,file:string,progress:(p:InstallProgress)=>void):Promise<string>{
  const response=await request(req.asset.url);
  const declared=Number(response.headers.get('content-length')??req.asset.size)||req.asset.size;
  const limit=Math.min(MAX_DOWNLOAD,req.asset.size>0?Math.ceil(req.asset.size*1.01)+1024:MAX_DOWNLOAD);
  if(declared>limit)throw new Error('El archivo es más grande de lo que anuncia la release.');
  if(!response.body)throw new Error('La descarga llegó vacía.');
  const hash=createHash('sha256');let received=0,last=0;
  const meter=new Transform({transform(chunk:Buffer,_e,done){
   received+=chunk.length;if(received>limit)return done(new Error('La descarga superó el tamaño anunciado.'));
   hash.update(chunk);const now=Date.now();if(now-last>150){last=now;progress({repo:req.repo,phase:'downloading',received,total:declared});}
   done(null,chunk);
  }});
  await pipeline(Readable.fromWeb(response.body as import('node:stream/web').ReadableStream),meter,createWriteStream(file));
  progress({repo:req.repo,phase:'downloading',received,total:received});
  return hash.digest('hex');
 }

 async function expectedChecksum(req:InstallRequest):Promise<string|null>{
  if(!req.checksumUrl)return null;
  const response=await request(req.checksumUrl,'text/plain');
  const text=(await response.text()).slice(0,256*1024);
  const name=decodeURIComponent(new URL(req.checksumUrl).pathname.split('/').pop()??'');
  return checksumFor(text,name,req.asset.name);
 }

 async function listArchive(format:InstallFormat,archive:string):Promise<string[]>{
  // bsdtar (macOS/Windows) lista zip, 7z y rar; en Linux zip usa unzip.
  const {stdout}=format==='zip'&&os==='Linux'?await run('unzip',['-Z1',archive],{maxBuffer:64*1024**2}):await run('tar',['-tf',archive],{maxBuffer:64*1024**2});
  return stdout.split(/\r?\n/).filter(Boolean);
 }

 async function extract(format:InstallFormat,archive:string,out:string){
  if(format==='dmg')return extractDmg(archive,out);
  if(format==='appimage'||format==='exe'||format==='binary'){
   const target=join(out,basename(archive));await cp(archive,target);if(os!=='Windows')await chmod(target,0o755);return;
  }
  const entries=await listArchive(format,archive);
  if(entries.length>MAX_FILES)throw new Error('El archivo contiene demasiados elementos.');
  const bad=entries.find(e=>!safeArchiveEntry(e));
  if(bad)throw new Error('El archivo intenta escribir fuera de su carpeta: '+bad);
  try{
   if(format==='zip'&&os==='macOS')await run('ditto',['-x','-k',archive,out]);
   else if(format==='zip'&&os==='Linux')await run('unzip',['-q','-o',archive,'-d',out]);
   else await run('tar',['-xf',archive,'-C',out]);
  }catch(e){
   const msg=(e as {stderr?:string}).stderr?.trim();
   throw new Error((format==='7z'||format==='rar')&&os==='Linux'?'Para extraer '+format+' en Linux instala bsdtar (libarchive-tools).':'No se pudo extraer el archivo'+(msg?': '+msg.slice(0,200):'.'));
  }
 }

 async function extractDmg(image:string,out:string){
  const mount=join(dirname(image),'mnt-'+randomUUID());await mkdir(mount);
  try{
   // Sin terminal, hdiutil no puede mostrar un acuerdo de licencia: falla en vez de quedarse esperando.
   await run('hdiutil',['attach','-nobrowse','-readonly','-noautoopen','-mountpoint',mount,image],{timeout:120_000});
  }catch{throw new Error('No se pudo montar la imagen de disco. Si pide aceptar una licencia, ábrela en Finder y copia la app a mano.');}
  try{
   const apps=(await readdir(mount)).filter(n=>n.toLowerCase().endsWith('.app'));
   if(!apps.length)throw new Error('La imagen de disco no contiene ninguna app.');
   for(const name of apps)await run('ditto',[join(mount,name),join(out,name)]);
  }finally{await run('hdiutil',['detach','-force',mount]).catch(()=>{});await rm(mount,{recursive:true,force:true});}
 }

 async function kindOf(path:string,mode:number):Promise<ExecutableCandidate['kind']|null>{
  const lower=path.toLowerCase();
  if(lower.endsWith('.exe'))return 'exe';
  if(lower.endsWith('.appimage'))return 'appimage';
  if(lower.endsWith('.sh'))return 'script';
  if(!(mode&0o111))return null;
  const fh=await open(path,'r');try{
   const b=Buffer.alloc(4);await fh.read(b,0,4,0);const m=b.readUInt32BE(0);
   if(m===0x7f454c46)return 'elf';
   if([0xfeedface,0xfeedfacf,0xcefaedfe,0xcffaedfe,0xcafebabe].includes(m))return 'macho';
  }finally{await fh.close();}
  return null;
 }

 /** Recorre lo extraído: rechaza enlaces que apunten fuera y recoge ejecutables candidatos. */
 async function inspectTree(root:string){
  const realRoot=await realpath(root),candidates:ExecutableCandidate[]=[];let files=0,bytes=0;
  async function walk(dir:string,depth:number){
   for(const entry of await readdir(dir,{withFileTypes:true})){
    if(++files>MAX_FILES)throw new Error('La instalación contiene demasiados archivos.');
    const full=join(dir,entry.name),rel=relative(realRoot,full);
    if(entry.isSymbolicLink()){
     const target=resolve(dirname(full),await readlink(full));
     if(!isInside(realRoot,target,sep))throw new Error('El archivo incluye un enlace que apunta fuera de la instalación: '+rel);
     continue;
    }
    if(entry.isDirectory()){
     if(entry.name.toLowerCase().endsWith('.app')){candidates.push({path:rel,depth,size:0,kind:'app'});}
     if(depth<MAX_DEPTH)await walk(full,depth+1);
     continue;
    }
    if(!entry.isFile())continue;
    const info=await lstat(full);bytes+=info.size;
    const kind=await kindOf(full,info.mode).catch(()=>null);
    if(kind)candidates.push({path:rel,depth,size:info.size,kind});
   }
  }
  await walk(realRoot,0);
  return {candidates,bytes};
 }

 /** Si todo vino dentro de una sola carpeta (Game-v1.2/...), usa esa carpeta como raíz. */
 async function contentRoot(out:string):Promise<string>{
  const entries=(await readdir(out,{withFileTypes:true})).filter(e=>!e.name.startsWith('.')&&e.name!=='__MACOSX');
  return entries.length===1&&entries[0].isDirectory()&&!entries[0].name.toLowerCase().endsWith('.app')?join(out,entries[0].name):out;
 }

 async function install(req:InstallRequest,progress:(p:InstallProgress)=>void):Promise<InstalledGame>{
  const format=installFormat(req.asset.name,os);
  if(!format)throw new Error('Este tipo de archivo no se puede instalar automáticamente en '+os+'. Descárgalo y sigue las instrucciones del proyecto.');
  if(active.has(req.repo.toLowerCase()))throw new Error('Ya hay una instalación en curso para este juego.');
  active.add(req.repo.toLowerCase());
  const work=join(stagingDir,randomUUID()),archive=join(work,req.asset.name),out=join(work,'out');
  try{
   await mkdir(out,{recursive:true});
   const [sha256,expected]=await Promise.all([download(req,archive,progress),expectedChecksum(req).catch(()=>null)]);
   if(req.checksumUrl){
    progress({repo:req.repo,phase:'verifying',received:0,total:0});
    if(!expected)throw new Error('La release publica sumas SHA-256 pero no incluyen este archivo.');
    if(expected!==sha256)throw new Error('La suma SHA-256 no coincide. El archivo se descartó.');
   }
   progress({repo:req.repo,phase:'extracting',received:0,total:0});
   await extract(format,archive,out);
   progress({repo:req.repo,phase:'finishing',received:0,total:0});
   const root=await contentRoot(out);
   const {candidates,bytes}=await inspectTree(root);
   const exe=pickExecutable(candidates,req.repo,os);
   const dest=gameDir(req.repo),previous=dest+'.old-'+Date.now();
   const old=await readManifest(req.repo);
   await mkdir(gamesDir,{recursive:true});
   const hadPrevious=await stat(dest).then(()=>true,()=>false);
   if(hadPrevious)await rename(dest,previous);
   try{await rename(root,dest);}catch(e){if(hadPrevious)await rename(previous,dest);throw e;}
   const game:InstalledGame={repo:req.repo,tag:req.tag,releaseId:req.releaseId,asset:req.asset.name,sha256,installedAt:new Date().toISOString(),executable:exe?.path.split(sep).join('/')??null,lastPlayed:old?.lastPlayed??null,sizeBytes:bytes};
   await writeManifest(dest,game);
   if(hadPrevious)await rm(previous,{recursive:true,force:true});
   return game;
  }finally{
   active.delete(req.repo.toLowerCase());
   await rm(work,{recursive:true,force:true}).catch(()=>{});
  }
 }

 async function executablePath(repo:string):Promise<{game:InstalledGame;path:string}>{
  const game=await readManifest(repo);
  if(!game)throw new Error('Este juego no está instalado en este equipo.');
  if(!game.executable)throw new Error('No se encontró el ejecutable. Usa «Elegir ejecutable».');
  const dir=gameDir(repo),path=resolve(dir,game.executable);
  if(!isInside(dir,path,sep))throw new Error('Ruta de ejecutable inválida.');
  return {game,path};
 }

 async function launch(repo:string){
  const {game,path}=await executablePath(repo);
  await stat(path).catch(()=>{throw new Error('El ejecutable ya no existe. Reinstala o elige otro.');});
  const child=os==='macOS'&&path.toLowerCase().endsWith('.app')?spawn('open',[path],{detached:true,stdio:'ignore'}):spawn(path,[],{cwd:dirname(path),detached:true,stdio:'ignore'});
  await new Promise<void>((ok,fail)=>{child.once('error',e=>fail(new Error('No se pudo abrir el juego: '+e.message)));child.once('spawn',()=>ok());});
  child.unref();
  const updated={...game,lastPlayed:new Date().toISOString()};
  await writeManifest(gameDir(repo),updated);
  return updated;
 }

 async function setExecutable(repo:string,absolute:string){
  const game=await readManifest(repo);if(!game)throw new Error('Este juego no está instalado.');
  const dir=await realpath(gameDir(repo)),target=await realpath(absolute);
  if(!isInside(dir,target,sep)||target===dir)throw new Error('Elige un archivo dentro de la carpeta del juego.');
  const updated={...game,executable:relative(dir,target).split(sep).join('/')};
  await writeManifest(dir,updated);return updated;
 }

 async function uninstall(repo:string){
  if(active.has(repo.toLowerCase()))throw new Error('Espera a que termine la instalación.');
  await rm(gameDir(repo),{recursive:true,force:true});
 }

 return {list,install,launch,uninstall,setExecutable,gameDir,readManifest,os};
}
