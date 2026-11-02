'use client';
import {useEffect,useState} from 'react';
import type {RadarEvent} from '@/lib/domain';
import {releaseOverview,releaseTag,installationFromRelease,type LibraryGame} from '@/lib/library';
import {bytesToHex,detectVisitorPlatform,parseChecksumFile,preferredInstallMemory,rankInstallAssets,type VisitorArch,type VisitorOS,type VisitorPlatform} from '@/lib/release-assets';
import {summarizeEvent} from '@/lib/event-summary';
import type {RepoCheck} from '@/hooks/use-radar';
import {Icon,when} from './radar-icons';
import {staggerStyle} from './animated-view';

export function Downloads({event,compact=false}:{event:RadarEvent;compact?:boolean}){
 const [platform,setPlatform]=useState('all');
 const files=event.downloads??[];
 const platforms=[...new Set(files.map(file=>file.platform))];
 const selected=platforms.includes(platform as typeof platforms[number])?platform:'all';
 const visible=files.filter(file=>selected==='all'||file.platform===selected);
 const [visitor,setVisitor]=useState<VisitorPlatform>({os:'Windows',arch:'unknown'});
 const [ready,setReady]=useState(false);
 const [memory,setMemory]=useState<import('@/lib/release-assets').InstallMemory|undefined>();
 const [checksum,setChecksum]=useState<'idle'|'checking'|'ok'|'bad'|'unavailable'>('idle');
 useEffect(()=>{let active=true;const run=async()=>{const nav=navigator as Navigator&{userAgentData?:{platform?:string;architecture?:string;bitness?:string;getHighEntropyValues?:(h:string[])=>Promise<{platform?:string;architecture?:string;bitness?:string}>}};let data=nav.userAgentData;try{if(data?.getHighEntropyValues)data={...data,...await data.getHighEntropyValues(['architecture','bitness','platform'])};}catch{/* User agent como alternativa. */}const detected=detectVisitorPlatform(navigator.userAgent,data);try{const os=localStorage.getItem('recomp-radar-install-os') as VisitorOS|null,arch=localStorage.getItem('recomp-radar-install-arch') as VisitorArch|null;if(active){setVisitor({...detected,...(os?{os}:{}),...(arch?{arch}:{})});setMemory(JSON.parse(localStorage.getItem('recomp-radar-install-memory:'+event.repo)??'null')??undefined);}}catch{if(active)setVisitor(detected);}if(active)setReady(true);};void run();return()=>{active=false};},[event.repo]);
 const ranked=rankInstallAssets(files,visitor,undefined,memory),best=ranked.best[0];
 const checksumAsset=files.find(file=>/\.sha256?$|sha256sums/i.test(file.name));
 async function verify(){if(!checksumAsset||!best)return;setChecksum('checking');try{const [sumResponse,fileResponse]=await Promise.all([fetch(checksumAsset.url),fetch(best.url)]);if(!sumResponse.ok||!fileResponse.ok)throw new Error('Descarga no disponible');const expected=parseChecksumFile(await sumResponse.text(),checksumAsset.name);if(!expected)throw new Error('Checksum inválido');const actual=bytesToHex(await crypto.subtle.digest('SHA-256',await fileResponse.arrayBuffer()));setChecksum(actual===expected?'ok':'bad');}catch{setChecksum('unavailable');}}
 function remember(file:typeof files[number]){setMemory(preferredInstallMemory(file,files));try{localStorage.setItem('recomp-radar-install-memory:'+event.repo,JSON.stringify(preferredInstallMemory(file,files)));}catch{/* Almacenamiento opcional. */}}
 function chooseOS(os:VisitorOS){setVisitor({...visitor,os});try{localStorage.setItem('recomp-radar-install-os',os);}catch{/* Almacenamiento opcional. */}}
 function chooseArch(arch:VisitorArch){setVisitor({...visitor,arch});try{localStorage.setItem('recomp-radar-install-arch',arch);}catch{/* Almacenamiento opcional. */}}
 const steps=/appimage$/.test(best?.name??'')?'Descarga el archivo y dale permiso de ejecución (chmod +x) antes de abrirlo.':/\.zip$/i.test(best?.name??'')||/\.7z$/i.test(best?.name??'')?'Descarga y extrae el archivo; sigue las instrucciones incluidas.':/\.apk$/i.test(best?.name??'')?'Descarga el APK y ábrelo en Android para iniciar la instalación.':/\.msi$/i.test(best?.name??'')?'Descarga y abre el instalador MSI.':/\.exe$/i.test(best?.name??'')?'Descarga y abre el ejecutable según las instrucciones del proyecto.':'Descarga el archivo y consulta las instrucciones del proyecto.';
 if(event.kind!=='release')return null;
 if(!files.length)return <div className="download-empty"><a href={event.url} target="_blank" rel="noreferrer">{event.assets?'Ver archivos en GitHub':'Consultar publicación en GitHub'} <Icon name="arrow" size={12}/></a></div>;
 return <section className={'release-downloads '+(compact?'compact':'')} aria-label={'Descargas de '+(releaseTag(event)??event.title)}>
  <div className="download-heading"><strong>Descargas para tu equipo</strong><label>Sistema <select value={visitor.os} onChange={e=>chooseOS(e.target.value as VisitorOS)} aria-label="Sistema operativo">{['Windows','macOS','Linux','Android'].map(p=><option key={p}>{p}</option>)}</select></label><label>Arquitectura <select value={visitor.arch} onChange={e=>chooseArch(e.target.value as VisitorArch)} aria-label="Arquitectura"><option value="unknown">Automática / universal</option><option value="x64">x64</option><option value="ARM64">ARM64</option><option value="x86">x86</option></select></label>{platforms.length>1&&<label>Plataforma <select value={selected} onChange={e=>setPlatform(e.target.value)}><option value="all">Todas</option>{platforms.map(p=><option key={p}>{p}</option>)}</select></label>}</div>
  {ready&&best&&<div className="install-recommendation"><strong>Instalar para {visitor.os} · {visitor.arch}</strong><a className="primary" href={best.url} onClick={()=>remember(best)}>{best.name} · {best.size>0?(best.size/1024/1024).toLocaleString('es-MX',{maximumFractionDigits:1})+' MB':'tamaño no indicado'} <Icon name="arrow" size={14}/></a>{visitor.os==='Linux'&&best.platform==='Windows'&&<small>En Linux: <code>wine &quot;{best.name}&quot;</code> o añádelo a Steam como juego externo y activa Proton.</small>}<small>{steps}</small>{checksumAsset&&<div className="checksum-check"><button type="button" onClick={()=>void verify()} disabled={checksum==='checking'}>{checksum==='checking'?'Verificando SHA-256…':'Verificar SHA-256'}</button><small role="status">{checksum==='ok'?'SHA-256 correcto':checksum==='bad'?'La suma SHA-256 no coincide':checksum==='unavailable'?'No se pudo verificar el checksum':'Verificación opcional desde el navegador'}</small></div>}</div>}
  <details className="other-downloads"><summary>Otros archivos ({visible.length})</summary><div className="download-files">{visible.map((file,index)=><a className="download-file stagger-item" style={staggerStyle(index)} key={file.url} href={file.url} target="_blank" rel="noreferrer" onClick={()=>remember(file)}><span><Icon name="release" size={16}/><b>{file.platform}{file.architecture?' · '+file.architecture:''}</b></span><small>{file.name}</small><small>{file.size>0?(file.size/1024/1024).toLocaleString('es-MX',{maximumFractionDigits:1})+' MB':'Archivo de la release'} <Icon name="arrow" size={12}/></small></a>)}</div></details>
 </section>;
}

export function GameCheck({check,error,pending=false,retryAt}:{check?:RepoCheck;error?:string|null;pending?:boolean;retryAt?:number|null}){
 const timestamp=check?.releasesAt??check?.lastSync;
 const hasError=!!(check?.error||error);
 return <div className={'game-check '+(pending||hasError?'pending':'')}>
  <span className={pending&&!retryAt?'spinning':''}><Icon name={pending||hasError?'refresh':'check'} size={13}/></span><span>{pending?(retryAt?'Consulta pendiente · GitHub en pausa':'Consulta en curso'):hasError?'Consulta incompleta · actualización pendiente':timestamp?'Releases consultadas · '+when(timestamp):'Primera consulta pendiente'}
  {(pending||hasError)&&timestamp&&<small>Últimos datos guardados · {when(timestamp)}</small>}
  {pending&&retryAt&&<small>Reintento · {when(new Date(retryAt).toISOString())}</small>}</span>
 </div>;
}

export function VersionComparison({game}:{game:LibraryGame}){
 const [base,setBase]=useState('__installed__');
 const release=game.overview.releases.find(e=>e.id===base);
 const installation=release?installationFromRelease(release,'comparison'):game.installation;
 const result=releaseOverview(game.overview.releases,installation);
 const captured=game.overview.releases.some(e=>e.id===installation?.releaseId||releaseTag(e)===installation?.tag);
 return <section className="version-comparison" aria-label="Comparar versiones">
  <div className="comparison-heading"><div><span className="section-label">DE TU VERSIÓN A LA ÚLTIMA</span><h2>Qué cambia al actualizar</h2></div><label>Comparar desde <select value={release?base:'__installed__'} onChange={e=>setBase(e.target.value)}><option value="__installed__">{game.installation?'Tu versión · '+game.installation.tag:'Selecciona una versión'}</option>{game.overview.releases.map(e=><option key={e.id} value={e.id}>{releaseTag(e)??e.title}{e.status==='prerelease'?' · Preliminar':''}</option>)}</select></label></div>
  {!installation?<p>Marca la versión que instalaste o elige una aquí para ver los cambios acumulados.</p>:<>
   <p className="comparison-range">Desde <strong>{installation.tag}</strong>{result.update&&<> hasta <strong>{releaseTag(result.update.release)??result.update.release.title}</strong></>}</p>
   {result.newerReleases.length?<div className="comparison-releases">{result.newerReleases.map(event=>{const summary=summarizeEvent(event);return <details key={event.id} open><summary><strong>{releaseTag(event)??event.title}</strong><span>{when(event.date)}</span><Icon name="plus" size={13}/></summary>{summary.points.length?<ul>{summary.points.slice(0,3).map((p,i)=><li key={i}><strong>{p.section}: </strong>{p.text}</li>)}</ul>:<p>La publicación no incluye notas detalladas.</p>}<a href={event.url} target="_blank" rel="noreferrer">Notas originales en GitHub <Icon name="arrow" size={12}/></a></details>;})}</div>:<p>{result.comparisonNote.startsWith('No podemos')?result.comparisonNote:'No hay releases posteriores capturadas para esta comparación.'}</p>}
   <small className="comparison-limit">Se comparan las releases guardadas de este juego. {captured?'':'Tu versión de partida no está en el historial capturado; pueden faltar cambios intermedios. '}{installation.prerelease?'Incluye versiones preliminares.':'Las preliminares quedan aparte.'} Cambiar esta selección no cambia tu versión instalada.</small>
  </>}
 </section>;
}
