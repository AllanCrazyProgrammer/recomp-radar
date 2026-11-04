'use client';
// Instalar, actualizar y jugar desde la versión de escritorio. En la web no se muestra nada.
import {useState} from 'react';
import type {Act} from '@/hooks/use-radar';
import {forgetInstalled,rememberInstalled,setBusy,useDesktop} from '@/hooks/use-desktop';
import {formatBytes,installFormat,phaseLabel,type InstalledGame} from '@/lib/desktop-install';
import {gameHref,releaseTag,type LibraryGame} from '@/lib/library';
import {rankInstallAssets} from '@/lib/release-assets';
import {Icon,when} from './radar-icons';

type Desktop=NonNullable<ReturnType<typeof useDesktop>>;

function targetRelease(game:LibraryGame){return game.overview.update?.release??game.overview.latest??null;}

function installChoices(game:LibraryGame,desktop:Desktop){
 const release=targetRelease(game),files=release?.downloads??[],platform=desktop.platform;
 if(!release||!platform)return {release,options:[],best:null,checksum:null};
 const os=platform.os as 'macOS'|'Windows'|'Linux';
 const {ranked,best}=rankInstallAssets(files,platform);
 const options=ranked.filter(f=>installFormat(f.name,os));
 const checksum=files.find(f=>/(?:sha256|checksums?)/i.test(f.name)&&f.platform==='Otros archivos')??null;
 return {release,options,best:options.find(f=>best.includes(f))??options[0]??null,checksum};
}

function Progress({desktop,repo}:{desktop:Desktop;repo:string}){
 const p=desktop.progressFor(repo);
 const pct=p&&p.phase==='downloading'&&p.total>0?Math.min(100,Math.round(p.received/p.total*100)):null;
 return <div className="desktop-progress" role="status" aria-live="polite">
  <div className="desktop-progress-bar"><span style={{width:pct===null?'100%':pct+'%'}} className={pct===null?'indeterminate':''}/></div>
  <small>{p?phaseLabel[p.phase]+(pct!==null?` · ${pct}% · ${formatBytes(p.received)} de ${formatBytes(p.total)}`:'…'):'Preparando…'}</small>
 </div>;
}

export function DesktopGamePanel({game,act}:{game:LibraryGame;act:Act}){
 const desktop=useDesktop();
 const [choice,setChoice]=useState(''),[error,setError]=useState('');
 if(!desktop)return null;
 const installed=desktop.game(game.repo),busy=desktop.isBusy(game.repo);
 const {release,options,best,checksum}=installChoices(game,desktop);
 const selected=options.find(f=>f.name===choice)??best;
 const tag=release?releaseTag(release)??release.title:null;
 const hasUpdate=!!installed&&!!release&&tag!==installed.tag;

 async function run(task:()=>Promise<void>){
  setError('');setBusy(game.repo,true);
  try{await task();}catch(e){setError(e instanceof Error?e.message:'No se pudo completar.');}
  finally{setBusy(game.repo,false);}
 }
 const install=()=>run(async()=>{
  if(!release||!selected||!tag)return;
  const result=await desktop.bridge.install({repo:game.repo,tag:release.releaseTag??tag,releaseId:release.id,asset:{name:selected.name,url:selected.url,size:selected.size},checksumUrl:checksum?.url??null});
  rememberInstalled(result);
  // Mantiene sincronizada la «versión marcada» de la cuenta con lo que se instaló de verdad.
  await act({action:'setInstalled',repo:game.repo,releaseId:release.id},true);
 });
 const play=()=>run(async()=>{rememberInstalled(await desktop.bridge.launch(game.repo));});
 const choose=()=>run(async()=>{const g=await desktop.bridge.chooseExecutable(game.repo);if(g)rememberInstalled(g);});
 const uninstall=()=>run(async()=>{if(await desktop.bridge.uninstall(game.repo)){forgetInstalled(game.repo);await act({action:'clearInstalled',repo:game.repo},true);}});

 return <section className="installed-panel desktop-panel" aria-labelledby="desktop-title">
  <div className="installed-heading"><span className="stat-icon green"><Icon name="game"/></span><div><span className="section-label">EN ESTE EQUIPO · {desktop.platform?.os??'…'} {desktop.platform?.arch??''}</span><h2 id="desktop-title">{installed?'Listo para jugar':'Instalar y jugar'}</h2></div></div>
  {installed&&<InstalledFacts game={installed}/>}
  {busy?<Progress desktop={desktop} repo={game.repo}/>:<div className="desktop-actions">
   {installed&&<button className="primary" onClick={()=>void play()} disabled={!installed.executable}><Icon name="game" size={16}/>Jugar</button>}
   {(!installed||hasUpdate)&&(selected?<button className={installed?'secondary':'primary'} onClick={()=>void install()}><Icon name="release" size={16}/>{installed?`Actualizar a ${tag}`:`Instalar ${tag}`} · {formatBytes(selected.size)}</button>:<p className="installed-empty">{release?`La release ${tag} no tiene un archivo que se pueda instalar automáticamente en ${desktop.platform?.os??'este sistema'}.`:'Todavía no hay releases capturadas para este juego.'}</p>)}
   {installed&&<><button className="secondary" onClick={()=>void desktop.bridge.reveal(game.repo).catch(e=>setError(e.message))}><Icon name="folder" size={15}/>Abrir carpeta</button><button className="secondary" onClick={()=>void choose()}>Elegir ejecutable</button><button className="secondary danger" onClick={()=>void uninstall()}>Desinstalar</button></>}
  </div>}
  {!busy&&(!installed||hasUpdate)&&options.length>1&&<label className="desktop-choice">Archivo<select value={selected?.name??''} onChange={e=>setChoice(e.target.value)}>{options.map(f=><option key={f.name} value={f.name}>{f.name}{f===best?' · recomendado':''}</option>)}</select></label>}
  {!busy&&!installed&&selected&&<small className="installation-limit">{checksum?`Se verificará con ${checksum.name} antes de instalar.`:'La release no publica sumas SHA-256; se guardará la huella del archivo descargado.'} Los archivos van a la carpeta de datos de Recomp Radar.</small>}
  {installed&&!installed.executable&&!busy&&<p className="message error"><Icon name="info" size={16}/><span>No encontramos el ejecutable del juego. Usa «Elegir ejecutable».</span></p>}
  {error&&<p className="message error" role="alert"><Icon name="info" size={16}/><span>{error}</span></p>}
 </section>;
}

function InstalledFacts({game}:{game:InstalledGame}){
 return <dl className="desktop-facts">
  <div><dt>Versión</dt><dd>{game.tag}</dd></div>
  <div><dt>Tamaño</dt><dd>{formatBytes(game.sizeBytes)}</dd></div>
  <div><dt>Instalado</dt><dd>{when(game.installedAt)}</dd></div>
  <div><dt>Última partida</dt><dd>{game.lastPlayed?when(game.lastPlayed):'Nunca'}</dd></div>
  <div className="wide"><dt>Ejecutable</dt><dd><code>{game.executable??'—'}</code></dd></div>
 </dl>;
}

/** Acción compacta para las tarjetas de la biblioteca. Devuelve null en la web. */
export function DesktopCardAction({game}:{game:LibraryGame}){
 const desktop=useDesktop();
 const [error,setError]=useState('');
 if(!desktop)return null;
 const installed=desktop.game(game.repo);
 if(desktop.isBusy(game.repo))return <span className="library-install-link">Instalando…</span>;
 if(!installed)return <a className="library-install-link" href={gameHref(game.repo)}>Instalar en este equipo <Icon name="arrow" size={13}/></a>;
 return <button className="library-install-link desktop-play" title={error||undefined} onClick={()=>void desktop.bridge.launch(game.repo).then(rememberInstalled,(e:Error)=>setError(e.message))}><Icon name="game" size={14}/>{error?'No se pudo abrir':'Jugar'} · {installed.tag}</button>;
}

export const isDesktop=()=>typeof window!=='undefined'&&!!window.radarDesktop;
