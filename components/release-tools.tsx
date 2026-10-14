'use client';
import {useState} from 'react';
import type {RadarEvent} from '@/lib/domain';
import {releaseOverview,releaseTag,installationFromRelease,type LibraryGame} from '@/lib/library';
import {summarizeEvent} from '@/lib/event-summary';
import type {RepoCheck} from '@/hooks/use-radar';
import {Icon,when} from './radar-icons';
import {staggerStyle} from './animated-view';

export function Downloads({event,compact=false}:{event:RadarEvent;compact?:boolean}){
 const [platform,setPlatform]=useState('all');
 if(event.kind!=='release')return null;
 const files=event.downloads??[];
 const platforms=[...new Set(files.map(file=>file.platform))];
 const selected=platforms.includes(platform as typeof platforms[number])?platform:'all';
 const visible=files.filter(file=>selected==='all'||file.platform===selected);
 if(!files.length)return <div className="download-empty"><a href={event.url} target="_blank" rel="noreferrer">{event.assets?'Ver archivos en GitHub':'Consultar publicación en GitHub'} <Icon name="arrow" size={12}/></a></div>;
 return <section className={'release-downloads '+(compact?'compact':'')} aria-label={'Descargas de '+(releaseTag(event)??event.title)}>
  <div className="download-heading"><strong>Descargas para tu equipo</strong>{platforms.length>1&&<label>Plataforma <select value={selected} onChange={e=>setPlatform(e.target.value)}><option value="all">Todas</option>{platforms.map(p=><option key={p}>{p}</option>)}</select></label>}</div>
  <div className="download-files">{visible.map((file,index)=><a className="download-file stagger-item" style={staggerStyle(index)} key={file.url} href={file.url} target="_blank" rel="noreferrer"><span><Icon name="release" size={16}/><b>{file.platform}{file.architecture?' · '+file.architecture:''}</b></span><small>{file.name}</small><small>{file.size>0?(file.size/1024/1024).toLocaleString('es-MX',{maximumFractionDigits:1})+' MB':'Archivo de la release'} <Icon name="arrow" size={12}/></small></a>)}</div>
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
