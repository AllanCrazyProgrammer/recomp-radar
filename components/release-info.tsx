'use client';
import {useId,useRef,useState,type KeyboardEvent} from 'react';
import {explain,type RadarEvent} from '@/lib/domain';
import {summarizeEvent} from '@/lib/event-summary';
import {releaseTag} from '@/lib/library';
import {guideReadme,projectGuide,type GuidePlatform} from '@/lib/project-guides';
import {staggerStyle} from './animated-view';

const tabs=[{id:'version',label:'Versión'},{id:'install',label:'Instalación'},{id:'update',label:'Actualizar'}] as const;
type Tab=typeof tabs[number]['id'];

export function ReleaseInfo({event}:{event:RadarEvent}){
 const id=useId(),buttons=useRef<Array<HTMLButtonElement|null>>([]);
 const [tab,setTab]=useState<Tab>('version'),[platform,setPlatform]=useState<GuidePlatform|null>(null);
 const summary=summarizeEvent(event),impact=explain(event),tag=releaseTag(event);
 // Reviewed Spanish guides enrich exact versions. Every other repo/version uses its own documents.
 const candidate=projectGuide(event.repo),guide=candidate?.reviewedTag===tag?candidate:null;
 const platforms=guide?Object.keys(guide.platforms) as GuidePlatform[]:[];
 const selected=platform&&platforms.includes(platform)?platform:platforms[0];
 const method=guide?.platforms[selected];
 const reviewed=guide&&tag===guide.reviewedTag;
 const readme=guideReadme(event.repo,tag),reviewedReadme=guide?guideReadme(event.repo,guide.reviewedTag):null;
 function onKey(event:KeyboardEvent<HTMLButtonElement>,index:number){
  let next:number;
  if(event.key==='ArrowRight')next=(index+1)%tabs.length;
  else if(event.key==='ArrowLeft')next=(index+tabs.length-1)%tabs.length;
  else if(event.key==='Home')next=0;
  else if(event.key==='End')next=tabs.length-1;
  else return;
  event.preventDefault();setTab(tabs[next].id);buttons.current[next]?.focus();
 }
 const version=<><span className="impact-label">{event.kind==='release'?'QUÉ INCLUYE ESTA VERSIÓN':'DETALLE DEL CAMBIO'}</span><p className="summary-status">{summary.status}{event.kind!=='release'?' · No es una publicación de versión.':''}</p>{summary.points.length?<ul className="release-summary">{summary.points.map((point,index)=><li key={index} className="stagger-item" style={staggerStyle(index)}><strong>{point.section}</strong><span>{point.text}</span></li>)}</ul>:<p>{event.kind==='release'?'Esta release no incluye notas detalladas. Consulta sus archivos y la fuente original.':event.title}</p>}<div className="impact-tags">{impact.tags.map(t=><span key={t}>{t}</span>)}{summary.points.length>0&&<small>{summary.language==='es'?'Resumen en español · basado en las notas originales':'Extractos de las notas originales'}</small>}</div></>;
 if(event.kind!=='release')return <div className="impact">{version}</div>;
 return <div className="impact release-info">
  <div className="release-info-tabs" role="tablist" aria-label={`Información de ${tag??event.title} · ${event.repo}`}>
   {tabs.map((item,index)=><button key={item.id} id={`${id}-${item.id}`} ref={button=>{buttons.current[index]=button;}} role="tab" aria-selected={tab===item.id} aria-controls={`${id}-panel`} tabIndex={tab===item.id?0:-1} onClick={()=>setTab(item.id)} onKeyDown={e=>onKey(e,index)}>{item.label}</button>)}
  </div>
  <div key={tab} id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${tab}`} tabIndex={0} className="release-info-panel animated-tab-panel">
   {tab==='version'?version:<div className="project-guide">
    <div className="guide-heading"><div><span className="impact-label">{tab==='install'?'CÓMO INSTALAR':'CÓMO ACTUALIZAR'}</span><h4>{guide?.project??event.repo}</h4></div>{guide&&<label htmlFor={`${id}-platform`}>Tu sistema <select id={`${id}-platform`} value={selected} onChange={e=>setPlatform(e.target.value as GuidePlatform)}>{platforms.map(p=><option key={p}>{p}</option>)}</select></label>}</div>
    {guide&&<p className="guide-version">Guía del proyecto · documentación de {guide.reviewedTag} · revisada el 4 oct 2026</p>}
    {guide&&!reviewed&&<p className="guide-scope">Estás viendo {tag??'otra versión'}. Los pasos siguientes corresponden a {guide.reviewedTag}; revisa el README y las notas de esta release antes de usar un paquete anterior o diferente.</p>}
    {method?<>
     {tab==='install'&&<><h5>Qué necesitas</h5><ul>{method.requirements.map(text=><li key={text}>{text}</li>)}</ul></>}
     <h5>{tab==='install'?'Pasos de instalación':'Pasos para actualizar'}</h5><ol>{(tab==='install'?method.install:method.update).map(text=><li key={text}>{text}</li>)}</ol>
     <div className="guide-data"><strong>{tab==='install'?'Dónde quedan tus datos':'Tus partidas y ajustes'}</strong><p>{method.data}</p></div>
     {tab==='update'&&method.note&&<p>{method.note}</p>}
     {tab==='update'&&summary.points.some(p=>p.section==='Antes de actualizar')&&<><h5>Para esta release</h5><ul>{summary.points.filter(p=>p.section==='Antes de actualizar').map((point,index)=><li key={index}>{point.text}</li>)}</ul></>}
    </>:<p className="guide-scope">La guía automática de este repositorio ya no se genera en el alojamiento estático. Consulta las notas de la release y el README del proyecto antes de instalar o actualizar.</p>}
    <div className="guide-sources">{readme&&<a href={readme} target="_blank" rel="noreferrer">README de {tag??'este proyecto'} ↗</a>}{guide&&reviewedReadme&&!reviewed&&<a href={reviewedReadme} target="_blank" rel="noreferrer">Fuente de esta guía ↗</a>}<a href={event.url} target="_blank" rel="noreferrer">Notas de esta release ↗</a></div>
   </div>}
  </div>
 </div>;
}
