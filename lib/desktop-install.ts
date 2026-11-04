// Lógica pura compartida entre la ventana (React) y el proceso principal de Electron.
// No usa APIs de Node ni del navegador para poder probarse con node --test.

export type DesktopOS='macOS'|'Windows'|'Linux';
export type InstallFormat='zip'|'tar'|'7z'|'rar'|'dmg'|'appimage'|'exe'|'binary';
export type InstallRequest={repo:string;tag:string;releaseId:string;asset:{name:string;url:string;size:number};checksumUrl?:string|null};
export type InstalledGame={repo:string;tag:string;releaseId:string;asset:string;sha256:string;installedAt:string;executable:string|null;lastPlayed:string|null;sizeBytes:number};
export type InstallPhase='downloading'|'verifying'|'extracting'|'finishing';
export type InstallProgress={repo:string;phase:InstallPhase;received:number;total:number};
export type ExecutableCandidate={path:string;depth:number;size:number;kind:'app'|'exe'|'appimage'|'elf'|'macho'|'script'};

const REPO=/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?\/[a-z\d_.-]{1,100}$/i;
export function validRepo(repo:string):boolean{return REPO.test(repo)&&!/\/\.\.?$/.test(repo);}

/** Carpeta segura para un repositorio: owner__repo, sin separadores ni puntos iniciales. */
export function gameFolderName(repo:string):string{
 if(!validRepo(repo))throw new Error('Repositorio inválido.');
 return repo.toLowerCase().replace('/','__').replace(/^\.+/,'_');
}

/** Solo acepta descargas de releases de GitHub del mismo repositorio y etiqueta. */
export function validAssetUrl(repo:string,tag:string,name:string,url:string):boolean{
 try{
  const u=new URL(url),p=u.pathname.split('/').slice(1).map(decodeURIComponent);
  return u.protocol==='https:'&&u.hostname==='github.com'&&!u.username&&!u.password&&!u.port&&!u.search&&!u.hash&&p.length===6&&p.slice(0,2).join('/').toLowerCase()===repo.toLowerCase()&&p[2]==='releases'&&p[3]==='download'&&p[4]===tag&&p[5]===name;
 }catch{return false;}
}

/** Hosts a los que GitHub redirige las descargas de releases. */
export function allowedDownloadHost(hostname:string):boolean{
 return hostname==='github.com'||hostname==='objects.githubusercontent.com'||hostname==='release-assets.githubusercontent.com';
}

export function validInstallRequest(value:unknown):InstallRequest|null{
 if(!value||typeof value!=='object')return null;
 const v=value as Record<string,unknown>,a=v.asset as Record<string,unknown>|undefined;
 if(typeof v.repo!=='string'||!validRepo(v.repo)||typeof v.tag!=='string'||!v.tag||v.tag.length>120||typeof v.releaseId!=='string'||v.releaseId.length>200)return null;
 if(!a||typeof a.name!=='string'||!a.name||a.name.length>240||/[\\/]/.test(a.name)||typeof a.url!=='string'||typeof a.size!=='number'||!(a.size>=0))return null;
 if(!validAssetUrl(v.repo,v.tag,a.name,a.url))return null;
 const checksumUrl=typeof v.checksumUrl==='string'?v.checksumUrl:null;
 if(checksumUrl){const name=decodeURIComponent(new URL(checksumUrl).pathname.split('/').pop()??'');if(!validAssetUrl(v.repo,v.tag,name,checksumUrl))return null;}
 return {repo:v.repo,tag:v.tag,releaseId:v.releaseId,asset:{name:a.name,url:a.url,size:a.size},checksumUrl};
}

export function installFormat(name:string,os:DesktopOS):InstallFormat|null{
 const n=name.toLowerCase();
 if(n.endsWith('.zip'))return 'zip';
 if(/\.(?:tar(?:\.(?:gz|xz|bz2|zst))?|tgz|txz|tbz2|tzst)$/.test(n))return 'tar';
 if(n.endsWith('.7z'))return '7z';
 if(n.endsWith('.rar'))return 'rar';
 if(n.endsWith('.dmg'))return os==='macOS'?'dmg':null;
 if(n.endsWith('.appimage'))return os==='Linux'?'appimage':null;
 if(n.endsWith('.exe'))return os==='Windows'?'exe':null;
 if(/\.(?:msi|msix|pkg|deb|rpm|flatpak|apk|ipa|sha\d*|txt|json|sig|asc)$/.test(n))return null;
 return /\.[a-z0-9]{1,5}$/.test(n)?null:'binary';
}

/** true si target está dentro de base (ambas rutas absolutas y normalizadas con el mismo separador). */
export function isInside(base:string,target:string,sep='/'):boolean{
 const b=base.endsWith(sep)?base:base+sep;
 return target===base||target.startsWith(b);
}

/** Valida una entrada de archivo comprimido antes de extraer: sin rutas absolutas, unidades ni "..". */
export function safeArchiveEntry(entry:string):boolean{
 if(!entry||entry.includes('\0'))return false;
 const e=entry.replace(/\\/g,'/');
 if(e.startsWith('/')||/^[a-z]:/i.test(e))return false;
 return !e.split('/').some(part=>part==='..');
}

const NOT_GAME=/(?:^|[\\/._ -])(?:unins\w*|uninstall\w*|setup|installer|vc_?redist\w*|dxsetup|dotnet\w*|crashpad\w*|crash_?handler|crashreport\w*|updater|update|helper|notification_helper|elevate|7za?)(?:\.[a-z]+)?$/i;

function words(repo:string):string[]{
 return repo.toLowerCase().split(/[\/_.\s-]+/).filter(w=>w.length>2&&!['the','game','port','recomp','native','pc','mobile'].includes(w));
}

/** Elige el ejecutable más probable: tipo nativo del sistema, nombre parecido al repo, menos profundo y más grande. */
export function pickExecutable(candidates:ExecutableCandidate[],repo:string,os:DesktopOS):ExecutableCandidate|null{
 const native:Record<DesktopOS,ExecutableCandidate['kind'][]>={macOS:['app','macho','script'],Windows:['exe'],Linux:['appimage','elf','script']};
 const order=native[os],keys=words(repo);
 // Lo que vive dentro de un bundle .app pertenece a ese bundle; se lanza el bundle, no su binario interno.
 const usable=candidates.filter(c=>order.includes(c.kind)&&!NOT_GAME.test(c.path)&&!/\.app\//i.test(c.path.replace(/\\/g,'/')));
 const name=(c:ExecutableCandidate)=>c.path.replace(/\\/g,'/').split('/').pop()!.toLowerCase();
 const score=(c:ExecutableCandidate)=>order.indexOf(c.kind)*100+c.depth*10-(keys.some(k=>name(c).includes(k))?50:0);
 return usable.sort((a,b)=>score(a)-score(b)||b.size-a.size||a.path.localeCompare(b.path))[0]??null;
}

export function parseInstalledGame(value:unknown):InstalledGame|null{
 if(!value||typeof value!=='object')return null;
 const v=value as Record<string,unknown>;
 if(typeof v.repo!=='string'||!validRepo(v.repo)||typeof v.tag!=='string'||typeof v.installedAt!=='string')return null;
 const executable=typeof v.executable==='string'&&safeArchiveEntry(v.executable)?v.executable:null;
 return {repo:v.repo,tag:v.tag,releaseId:typeof v.releaseId==='string'?v.releaseId:'',asset:typeof v.asset==='string'?v.asset:'',sha256:typeof v.sha256==='string'?v.sha256:'',installedAt:v.installedAt,executable,lastPlayed:typeof v.lastPlayed==='string'?v.lastPlayed:null,sizeBytes:typeof v.sizeBytes==='number'?v.sizeBytes:0};
}

/** Busca el SHA-256 de assetName en un archivo de sumas (SHA256SUMS o asset.sha256). */
export function checksumFor(text:string,checksumName:string,assetName:string):string|null{
 const single=checksumName.replace(/\.(?:sha256|sha256sum|sha)$/i,'')===assetName;
 for(const raw of text.split(/\r?\n/)){
  const line=raw.trim(),pair=line.match(/^([a-f\d]{64})\s+\*?(.+)$/i);
  if(pair&&pair[2].replace(/^\.\//,'')===assetName)return pair[1].toLowerCase();
  if(single&&/^[a-f\d]{64}$/i.test(line))return line.toLowerCase();
  if(single&&pair)return pair[1].toLowerCase();
 }
 return null;
}

export function formatBytes(bytes:number):string{
 if(!(bytes>0))return '—';
 const units=['B','KB','MB','GB'];let i=0,n=bytes;while(n>=1024&&i<units.length-1){n/=1024;i++;}
 return n.toLocaleString('es-MX',{maximumFractionDigits:i>1?1:0})+' '+units[i];
}

export const phaseLabel:Record<InstallPhase,string>={downloading:'Descargando',verifying:'Verificando SHA-256',extracting:'Extrayendo',finishing:'Preparando el juego'};
