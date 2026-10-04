'use client';
import {Fragment,useEffect,useState,type ReactNode} from 'react';
import type {RadarEvent} from '@/lib/domain';
import {safeGuideLink,extractGuide,GUIDE_CACHE_MS,type RepositoryGuide as Guide,type GuideSection} from '@/lib/repository-guide';
import {summarizeEvent} from '@/lib/event-summary';

const memory=new Map<string,{guide:Guide;expires:number}>(),pending=new Map<string,Promise<Guide>>();
async function getGuide(event:Pick<RadarEvent,'repo'|'id'>){
 const key=event.repo+':'+event.id,saved=memory.get(key);if(saved&&saved.expires>Date.now())return saved.guide;
 const running=pending.get(key);if(running)return running;
 const job=(async()=>{
  const response=await fetch('/api/project-guide?'+new URLSearchParams({repo:event.repo,release:event.id}),{credentials:'same-origin'});
  const data=await response.json() as Guide&{error?:string};if(!response.ok)throw new Error(data.error??'No se pudo consultar esta guía.');
  const guide=data as Guide;
  if(memory.size>=200)memory.delete(memory.keys().next().value!);
  memory.set(key,{guide,expires:Date.now()+(guide.stale?60_000:GUIDE_CACHE_MS)});return guide;
 })();pending.set(key,job);try{return await job;}finally{pending.delete(key);}
}

function inline(text:string,base:string):ReactNode{
 // React escapes source text; HTML and remote images are never rendered.
 const parts:ReactNode[]=[];let start=0;
 for(const match of text.matchAll(/(!?\[([^\]\n]*)\]\(([^\s)]+)\)|`([^`]+)`|\*\*([^*]+)\*\*)/g)){
  parts.push(text.slice(start,match.index));const key=match.index;
  if(match[4])parts.push(<code key={key}>{match[4]}</code>);
  else if(match[5])parts.push(<strong key={key}>{match[5]}</strong>);
  else if(!match[0].startsWith('!')){const href=safeGuideLink(match[3],base);parts.push(href?<a key={key} href={href} target="_blank" rel="noreferrer">{match[2]}</a>:match[2]);}
  start=match.index!+match[0].length;
 }parts.push(text.slice(start));return parts;
}

function SourceText({markdown,url}:{markdown:string;url:string}){
 const lines=markdown.replace(/\r/g,'').split('\n'),blocks:ReactNode[]=[];
 for(let i=0;i<lines.length;){
  const key=i,line=lines[i];if(!line.trim()||/^\s*>?\s*\[!(?:NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/.test(line)){i++;continue;}
  const fence=line.match(/^\s*(`{3,}|~{3,})/);
  if(fence){const code:string[]=[];i++;while(i<lines.length&&!lines[i].trim().startsWith(fence[1]))code.push(lines[i++]);i++;blocks.push(<pre key={key}><code>{code.join('\n')}</code></pre>);continue;}
  const heading=line.match(/^#{1,6}\s+(.+?)\s*#*$/);
  if(heading){blocks.push(<h5 key={key}>{inline(heading[1],url)}</h5>);i++;continue;}
  if(/^\s*(?:[-*+]\s+|\d+[.)]\s+)/.test(line)){
   const ordered=/^\s*\d/.test(line),items:ReactNode[]=[];
   while(i<lines.length&&/^\s*(?:[-*+]\s+|\d+[.)]\s+)/.test(lines[i])){
    const first=i;let text=lines[i++].replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+)/,'');
    while(i<lines.length&&/^\s{2,}\S/.test(lines[i])&&!/^\s*(?:[-*+]\s+|\d+[.)]\s+|```|~~~)/.test(lines[i]))text+=' '+lines[i++].trim();
    items.push(<li key={first}>{inline(text,url)}</li>);
   }blocks.push(ordered?<ol key={key}>{items}</ol>:<ul key={key}>{items}</ul>);continue;
  }
  const paragraph=[line];i++;
  while(i<lines.length&&lines[i].trim()&&!/^\s*(?:#{1,6}\s|```|~~~|[-*+]\s+|\d+[.)]\s+)/.test(lines[i]))paragraph.push(lines[i++]);
  blocks.push(<p key={key}>{inline(paragraph.map(p=>p.replace(/^>\s?/,'' )).join('\n'),url)}</p>);
 }
 return <div className="guide-source-text">{blocks}</div>;
}

export function RepositoryGuide({event,tab}:{event:RadarEvent;tab:'install'|'update'}){
 const [loaded,setLoaded]=useState<{key:string;guide?:Guide;error?:string}|null>(null),[attempt,setAttempt]=useState(0);
 const {repo,id}=event,key=repo+':'+id+':'+attempt;
 const guide=loaded?.key===key?loaded.guide??null:null,error=loaded?.key===key?loaded.error??null:null;
 useEffect(()=>{let alive=true;getGuide({repo,id}).then(guide=>{if(alive)setLoaded({key,guide});}).catch(e=>{if(alive)setLoaded({key,error:e.message});});return()=>{alive=false;};},[repo,id,key]);
 const releaseUpdate=tab==='update'?extractGuide({path:'release-notes.md',url:event.url,ref:event.releaseTag??null,markdown:event.body}).update:[];
 const sections:GuideSection[]=[...(guide?.[tab]??[]),...releaseUpdate],summary=summarizeEvent(event);
 return <>
  {!guide&&!error&&<p role="status">Consultando la documentación de este proyecto…</p>}
  {error&&<p role="alert">{error} <button onClick={()=>setAttempt(n=>n+1)}>Reintentar</button></p>}
  {guide&&<>
   <p className="guide-version">Documentación del proyecto · {guide.ref===guide.tag&&guide.tag?guide.tag:'rama actual'} · extractos en su idioma original</p>
   {guide.tag&&guide.ref!==guide.tag&&<p className="guide-scope">La etiqueta {guide.tag} no tiene un README disponible. Esta documentación corresponde a la rama actual; comprueba las notas de la versión seleccionada.</p>}
   {guide.notice&&<p className="guide-scope" role="status">{guide.notice}{guide.retryAt?' Puedes consultar de nuevo después de '+new Date(guide.retryAt).toLocaleTimeString('es-MX')+'.':''}</p>}
   {sections.map((section,index)=><section className="guide-extracted" key={index}><h5>{section.title}</h5><SourceText markdown={section.markdown} url={section.url}/><a className="guide-section-source" href={section.url} target="_blank" rel="noreferrer">Ver documento original ↗</a></section>)}
   {!sections.length&&<p>{tab==='install'?'No se encontró una sección explícita de instalación en la documentación disponible. Puedes abrir los documentos completos y los enlaces oficiales de abajo.':'El proyecto no documenta un procedimiento específico de actualización en los documentos consultados. Revisa las notas de esta release y su documentación antes de reemplazar archivos.'}</p>}
   {tab==='update'&&summary.points.length>0&&!releaseUpdate.length&&<div className="guide-data"><strong>Indicaciones de esta release</strong>{summary.points.map((point,index)=><Fragment key={index}><h5>{point.section}</h5><p>{point.text}</p></Fragment>)}</div>}
   {guide.documents.map(doc=><details className="guide-full-document" key={doc.url}><summary>Documento completo: {doc.path}</summary><SourceText markdown={doc.markdown} url={doc.url}/></details>)}
   <div className="guide-sources">{guide.documents.map(doc=><a key={doc.url} href={doc.url} target="_blank" rel="noreferrer">{doc.path} ↗</a>)}</div>
  </>}
 </>;
}
