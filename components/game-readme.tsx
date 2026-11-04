'use client';
// Ficha del juego: el README del repositorio, leído de raw.githubusercontent.com (no gasta cuota de la API)
// y mostrado como bloques React, sin insertar HTML del repositorio.
import {useEffect,useState} from 'react';
import {parseReadme,readmeUrl,README_MAX_BYTES,type Block,type Inline} from '@/lib/readme';
import {Icon} from './radar-icons';

const TTL=6*3600_000,PREVIEW=8;
type Cached={text:string;at:number};
type Load={repo:string;status:'loading'|'ready'|'missing'|'error';text:string};

function cached(repo:string):Cached|null{try{const v=JSON.parse(localStorage.getItem('recomp-radar-readme:'+repo.toLowerCase())??'null');return v&&typeof v.text==='string'&&typeof v.at==='number'?v:null;}catch{return null;}}

function Text({parts}:{parts:Inline[]}){
 return <>{parts.map((p,i)=>p.kind==='link'?<a key={i} href={p.href} target="_blank" rel="noreferrer noopener">{p.text}</a>:p.kind==='code'?<code key={i}>{p.text}</code>:p.kind==='strong'?<strong key={i}>{p.text}</strong>:p.kind==='em'?<em key={i}>{p.text}</em>:<span key={i}>{p.text}</span>)}</>;
}

function BlockView({block}:{block:Block}){
 switch(block.kind){
  case 'heading':return block.level===1?<h3><Text parts={block.inline}/></h3>:block.level===2?<h4><Text parts={block.inline}/></h4>:<h5><Text parts={block.inline}/></h5>;
  case 'paragraph':return <p><Text parts={block.inline}/></p>;
  case 'quote':return <blockquote><Text parts={block.inline}/></blockquote>;
  case 'code':return <pre><code>{block.text}</code></pre>;
  case 'list':{const items=block.items.map((item,i)=><li key={i}><Text parts={item}/></li>);return block.ordered?<ol>{items}</ol>:<ul>{items}</ul>;}
 }
}

export function GameReadme({repo}:{repo:string}){
 const url=readmeUrl(repo);
 const [load,setLoad]=useState<Load>({repo,status:'loading',text:''});
 const [open,setOpen]=useState(false);
 useEffect(()=>{
  if(!url)return;
  let active=true;
  const hit=cached(repo);
  const done=(next:Omit<Load,'repo'>)=>{if(active)setLoad({repo,...next});};
  if(hit)done({status:'ready',text:hit.text});
  if(hit&&Date.now()-hit.at<TTL)return()=>{active=false;};
  void fetch(url,{signal:AbortSignal.timeout(10_000)}).then(async r=>{
   if(r.status===404){if(!hit)done({status:'missing',text:''});return;}
   if(!r.ok)throw new Error(String(r.status));
   const text=(await r.text()).slice(0,README_MAX_BYTES);
   try{localStorage.setItem('recomp-radar-readme:'+repo.toLowerCase(),JSON.stringify({text,at:Date.now()}));}catch{/* Caché opcional. */}
   done({status:'ready',text});
  }).catch(()=>{if(!hit)done({status:'error',text:''});});
  return()=>{active=false;};
 },[repo,url]);
 if(!url)return null;
 const current=load.repo===repo?load:{repo,status:'loading' as const,text:''};
 const blocks=current.status==='ready'?parseReadme(current.text,repo):[];
 const visible=open?blocks:blocks.slice(0,PREVIEW);
 return <section className="installed-panel game-readme" aria-labelledby="readme-title">
  <div className="installed-heading"><span className="stat-icon"><Icon name="info"/></span><div><span className="section-label">FICHA DEL JUEGO · README</span><h2 id="readme-title">Acerca de este proyecto</h2></div></div>
  {current.status==='loading'&&<p className="installed-empty">Cargando el README…</p>}
  {current.status==='missing'&&<p className="installed-empty">Este repositorio no tiene README.md en su rama principal.</p>}
  {current.status==='error'&&<p className="installed-empty">No se pudo cargar el README. <a href={`https://github.com/${repo}#readme`} target="_blank" rel="noreferrer">Ábrelo en GitHub ↗</a></p>}
  {current.status==='ready'&&<div className="readme-body">{visible.map((b,i)=><BlockView key={i} block={b}/>)}</div>}
  {blocks.length>PREVIEW&&<button className="text-button" onClick={()=>setOpen(!open)}>{open?'Mostrar menos':`Leer todo (${blocks.length-PREVIEW} secciones más)`}</button>}
  <small className="installation-limit">Contenido del repositorio, mostrado como texto. <a href={`https://github.com/${repo}#readme`} target="_blank" rel="noreferrer">Ver original ↗</a></small>
 </section>;
}
