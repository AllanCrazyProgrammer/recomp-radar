export type ReleaseDownload={name:string;url:string;size:number;platform:'Windows'|'macOS'|'Linux'|'Android'|'Otros archivos';architecture:string|null};

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
