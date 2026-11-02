export type ReleaseDownload={name:string;url:string;size:number;platform:'Windows'|'macOS'|'Linux'|'Android'|'Otros archivos';architecture:string|null};
export type VisitorOS='Windows'|'macOS'|'Linux'|'Android';
export type VisitorArch='x64'|'ARM64'|'x86'|'unknown';
export type VisitorPlatform={os:VisitorOS;arch:VisitorArch};

const auxiliary=/(?:^|[-_. ])(?:sha\d+|checksum|checksums|sig|asc|pdb|debug|symbols?|source|sources|src)(?:$|[-_. ])/i;
const extension=(name:string)=>name.toLowerCase().match(/\.(zip|7z|tar\.gz|tgz|tar\.xz|tar\.bz2|appimage|flatpak|exe|apk|msi)$/)?.[1]??'';
export function rankInstallAssets(files:ReleaseDownload[],visitor:VisitorPlatform,preferredName?:string|null):ReleaseDownload[]{
 const formatRank=(file:ReleaseDownload)=>{const ext=extension(file.name);return ({zip:0,'7z':1,'tar.gz':2,tgz:2,'tar.xz':2,'tar.bz2':2,appimage:3,flatpak:3,exe:4,apk:5,msi:6} as Record<string,number>)[ext]??99;};
 const archRank=(file:ReleaseDownload)=>file.architecture===visitor.arch?0:file.architecture==='Universal'||file.architecture===null?1:visitor.arch==='x64'&&file.architecture==='x86'?4:2;
 const osRank=(file:ReleaseDownload)=>file.platform===visitor.os?0:file.platform==='Otros archivos'?1:visitor.os==='Linux'&&file.platform==='Windows'?3:8;
 return files.filter(f=>!auxiliary.test(f.name)&&extension(f.name)!=='').filter(f=>!(extension(f.name)==='msi'&&visitor.os!=='Windows')&&!(extension(f.name)==='apk'&&visitor.os!=='Android')).map(file=>({file,score:[osRank(file),archRank(file),formatRank(file),preferredName&&normalizeVariant(file.name)===preferredName?0:1,file.name.toLowerCase()]})).filter(x=>x.score[0]!==8).sort((a,b)=>{for(let i=0;i<a.score.length;i++){const x=a.score[i],y=b.score[i];if(x!==y)return typeof x==='number'&&typeof y==='number'?x-y:String(x).localeCompare(String(y));}return 0;}).map(x=>x.file);
}
export function normalizeVariant(name:string):string{return name.toLowerCase().replace(/\.(zip|7z|tar\.gz|tgz|tar\.xz|tar\.bz2|appimage|flatpak|exe|apk|msi)$/i,'').replace(/(?:v?\d+(?:\.\d+)+(?:[-+][\w.-]+)?)/gi,'').replace(/(?:windows|win32|win64|win|macos|darwin|osx|linux|android|universal|x86[-_]?64|amd64|x64|aarch64|arm64|i[3-6]86|x86)/gi,'').replace(/[^a-z0-9]+/g,' ').trim();}
export function artFallbackOrder(custom:boolean,images:string[]):string[]{return [...(custom?['custom']:[]),...images.filter(Boolean),'placeholder'];}
export type LibraryViewOptions={layout:'grid'|'list';image:'cover'|'header'|'icon';size:'small'|'medium'|'large';showNames:boolean;sort:'az'|'release'|'update';installed:'all'|'installed'|'missing'};
export const DEFAULT_LIBRARY_VIEW:LibraryViewOptions={layout:'grid',image:'cover',size:'medium',showNames:true,sort:'az',installed:'all'};
export function parseLibraryViewOptions(value:unknown):LibraryViewOptions{if(!value||typeof value!=='object')return DEFAULT_LIBRARY_VIEW;const v=value as Record<string,unknown>;return{layout:v.layout==='list'?'list':'grid',image:v.image==='header'||v.image==='icon'?v.image:'cover',size:v.size==='small'||v.size==='large'?v.size:'medium',showNames:typeof v.showNames==='boolean'?v.showNames:true,sort:v.sort==='release'||v.sort==='update'?v.sort:'az',installed:v.installed==='installed'||v.installed==='missing'?v.installed:'all'};}
export function detectVisitorPlatform(userAgent:string,userAgentData?:{platform?:string;architecture?:string}):VisitorPlatform{const os=userAgentData?.platform||userAgent;const lower=os.toLowerCase();const system:VisitorOS=lower.includes('android')?'Android':lower.includes('win')?'Windows':lower.includes('mac')?'macOS':'Linux';const a=(userAgentData?.architecture||userAgent).toLowerCase();const arch:VisitorArch=/arm|aarch64/.test(a)?'ARM64':/x86_64|x86-64|amd64|x64|wow64/.test(a)?'x64':/i[3-6]86|x86/.test(a)?'x86':'unknown';return{os:system,arch};}

export function releaseDownloads(repo:string,tag:string,assets:unknown):ReleaseDownload[]{
 if(!Array.isArray(assets))return [];
 const seen=new Set<string>();const result:ReleaseDownload[]=[];
 for(const raw of assets.slice(0,100)){
  if(!raw||typeof raw!=='object')continue;
  const asset=raw as Record<string,unknown>;
  if(typeof asset.name!=='string'||!asset.name||asset.name.length>240||typeof asset.browser_download_url!=='string'||asset.state==='new')continue;
  try{
   const url=new URL(asset.browser_download_url);const parts=url.pathname.split('/').slice(1).map(decodeURIComponent);
   if(url.protocol!=='https:'||url.hostname!=='github.com'||url.username||url.password||url.port||url.search||url.hash||parts.length!==6||parts.slice(0,2).join('/').toLowerCase()!==repo.toLowerCase()||parts[2]!=='releases'||parts[3]!=='download'||parts[4]!==tag||parts[5]!==asset.name||seen.has(url.href))continue;
   const name=asset.name.toLowerCase();
   const extra=/(?:^|[-_.])(mods?|symbols?|debug|source|checksum)(?:[-_.]|$)/.test(name)||/\.(sha256|txt|nrm)$/.test(name);
   const platform=extra?'Otros archivos':/\.apk$/.test(name)||/android/.test(name)?'Android':/windows|win32|win64|(?:^|[-_.])win(?:[-_.]|$)|\.(exe|msi|msix)$/.test(name)?'Windows':/macos|darwin|osx|\.(dmg|pkg)$/.test(name)?'macOS':/linux|\.appimage$/.test(name)?'Linux':'Otros archivos';
   const architecture=/aarch64|arm64/.test(name)?'ARM64':/x86[-_]64|amd64|x64/.test(name)?'x64':/universal/.test(name)?'Universal':null;
   seen.add(url.href);result.push({name:asset.name,url:url.href,size:typeof asset.size==='number'&&Number.isFinite(asset.size)&&asset.size>=0?asset.size:0,platform,architecture});
  }catch{continue;}
 }
 return result;
}
