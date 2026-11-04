'use client';
// «Descubrir»: el catálogo público de Quiver Launcher dentro de Novedades.
// Recomp Radar no está afiliado a Quiver; se atribuye y enlaza siempre a quiverlauncher.com.
import {useEffect,useMemo,useRef,useState} from 'react';
import type {Act} from '@/hooks/use-radar';
import {detectVisitorPlatform} from '@/lib/release-assets';
import {aiLabel,appPage,appsPath,catalogGet,osLabel,parseConsoles,parseDetail,parsePage,playerVerdict,QUIVER_SITE,sortLabel,typeLabel,type CatalogConsole,type CatalogDetail,type CatalogEntry,type CatalogOs,type CatalogQuery,type CatalogSort,type CatalogType} from '@/lib/quiver-catalog';
import {GameReadme} from './game-readme';
import {Icon,when} from './radar-icons';
import {staggerStyle} from './animated-view';

const TTL=5*60_000;
const memo=new Map<string,{at:number;data:unknown}>();
async function cached(path:string){const hit=memo.get(path);if(hit&&Date.now()-hit.at<TTL)return hit.data;const data=await catalogGet(path);memo.set(path,{at:Date.now(),data});return data;}

type Filters={search:string;os:CatalogOs|'';console:string;projectType:CatalogType|'';hideGenerated:boolean};
const SHELVES:CatalogSort[]=['rating','updated','added'];

function useMyOs():CatalogOs|''{
 const [os,setOs]=useState<CatalogOs|''>('');
 useEffect(()=>{let live=true;
  const map=(v:string):CatalogOs=>v==='macOS'?'macos':v==='Windows'?'windows':v==='Android'?'android':'linux';
  const run=async()=>{try{const p=window.radarDesktop?await window.radarDesktop.platform():detectVisitorPlatform(navigator.userAgent);if(live)setOs(map(p.os));}catch{}};
  void run();return()=>{live=false;};},[]);
 return os;
}

function consoleName(id:string,consoles:CatalogConsole[]){return consoles.find(c=>c.id===id)?.name??id.toUpperCase();}

function Art({entry,wide=false}:{entry:CatalogEntry;wide?:boolean}){
 const sources=[wide?entry.art.hero:null,entry.art.header,entry.art.hero,entry.art.capsule,entry.art.icon].filter((s,i,a):s is string=>!!s&&a.indexOf(s)===i);
 const [index,setIndex]=useState(0);
 const src=sources[index];
 const initials=entry.name.split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase();
 return <div className={'game-art image-box discover-art'+(wide?' discover-hero':'')}>{src?<img src={src} alt="" loading={wide?'eager':'lazy'} onError={()=>setIndex(index+1)} className={src===entry.art.icon?'foreground-art icon-art':''}/>:<div className="game-art-placeholder" aria-hidden="true"><div className="game-emblem initials-emblem">{initials}</div></div>}</div>;
}

function Card({entry,consoles,onOpen,index}:{entry:CatalogEntry;consoles:CatalogConsole[];onOpen:(e:CatalogEntry)=>void;index:number}){
 const verdict=playerVerdict(entry),ai=aiLabel(entry.aiLevel);
 return <article className="game-card discover-card stagger-item" style={staggerStyle(index)}>
  <button className="game-open" onClick={()=>onOpen(entry)} aria-label={'Ver '+entry.projectName}>
   <Art entry={entry}/>
   {ai&&<span className={'discover-ai '+entry.aiLevel}>{ai}</span>}
   <div className="game-card-title">
    <span className="section-label">{[entry.games[0]??entry.name,...entry.consoles.slice(0,2).map(c=>consoleName(c,consoles))].join(' · ')}</span>
    <h3>{entry.projectName}</h3>
    <span className={'discover-verdict '+verdict.tone}>{verdict.label}</span>
    <small className="discover-meta">{entry.supportedOS.map(o=>osLabel[o]).join(' · ')||'Sistema no indicado'}{entry.lastReleaseVersion?' · '+entry.lastReleaseVersion:''}</small>
   </div>
  </button>
 </article>;
}

function Detail({entry,consoles,act,busy,library,onClose}:{entry:CatalogEntry;consoles:CatalogConsole[];act:Act;busy:boolean;library:string[];onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null);
 const [detail,setDetail]=useState<{slug:string;data:CatalogDetail|null;error:string}>({slug:'',data:null,error:''});
 const [added,setAdded]=useState(false);
 useEffect(()=>{dialog.current?.showModal();},[]);
 useEffect(()=>{let live=true;
  cached('/apps/'+encodeURIComponent(entry.slug)).then(d=>{if(live)setDetail({slug:entry.slug,data:parseDetail(d),error:''});},(e:Error)=>{if(live)setDetail({slug:entry.slug,data:null,error:e.message});});
  return()=>{live=false;};},[entry.slug]);
 const d=detail.slug===entry.slug?detail.data:null,loading=detail.slug!==entry.slug;
 const github=d?.provider==='github'&&d.repository?d.repository:null;
 const inLibrary=!!github&&library.includes(github.toLowerCase());
 const verdict=playerVerdict(entry),ai=aiLabel(entry.aiLevel);
 async function add(){if(!github)return;if(await act({action:'add',input:github,label:(entry.games[0]??entry.name).slice(0,60)}))setAdded(true);}
 return <dialog ref={dialog} className="modal discover-modal" aria-labelledby="discover-title" onClose={onClose} onClick={e=>{if(e.target===e.currentTarget)dialog.current?.close();}}>
  <div className="modal-title"><span><Icon name="radar" size={16}/>Catálogo de quiverlauncher.com</span><button className="icon-button" onClick={()=>dialog.current?.close()} aria-label="Cerrar"><Icon name="close"/></button></div>
  <div className="discover-detail">
   <Art entry={entry} wide/>
   <div className="discover-detail-body">
    <span className="section-label">{[d?.gameTitle??entry.games[0]??entry.name,d?.year,...entry.consoles.map(c=>consoleName(c,consoles))].filter(Boolean).join(' · ')}</span>
    <h2 id="discover-title">{entry.projectName}</h2>
    <p className={'discover-verdict '+verdict.tone}>{verdict.label}{ai&&<span className={'discover-ai inline '+entry.aiLevel}>{ai}</span>}</p>
    {entry.description&&<p>{entry.description}</p>}
    <dl className="desktop-facts">
     <div><dt>Última versión</dt><dd>{entry.lastReleaseVersion??'—'}</dd></div>
     <div><dt>Publicada</dt><dd>{entry.lastReleaseAt?when(new Date(entry.lastReleaseAt).toISOString()):'—'}</dd></div>
     <div><dt>Sistemas</dt><dd>{entry.supportedOS.map(o=>osLabel[o]).join(', ')||'—'}</dd></div>
     <div><dt>Autor</dt><dd>{d?.author??entry.developer??'—'}</dd></div>
    </dl>
    {!!entry.tags.length&&<div className="impact-tags discover-tags">{entry.tags.slice(0,10).map(t=><span key={t}>{t}</span>)}</div>}
    <div className="discover-actions">
     {loading?<button className="primary" disabled>Cargando…</button>:inLibrary||added?<span className="discover-in-library"><Icon name="check" size={16}/>En tu biblioteca</span>:github?<button className="primary" disabled={busy} onClick={()=>void add()}><Icon name="plus" size={16}/>Añadir a mi biblioteca</button>:<small>{d?`Este proyecto está en ${d.provider}; Recomp Radar solo sigue repositorios de GitHub.`:detail.error||'No se pudo leer el repositorio.'}</small>}
     <a className="secondary" href={appPage(entry.slug)} target="_blank" rel="noreferrer">Ver en Quiver ↗</a>
     {github&&<a className="secondary" href={'https://github.com/'+github} target="_blank" rel="noreferrer">Repositorio ↗</a>}
     {d?.website&&<a className="secondary" href={d.website} target="_blank" rel="noreferrer">Web del proyecto ↗</a>}
    </div>
   </div>
   {github&&<GameReadme repo={github}/>}
  </div>
 </dialog>;
}

function Shelf({sort,filters,consoles,onOpen,onMore}:{sort:CatalogSort;filters:Filters;consoles:CatalogConsole[];onOpen:(e:CatalogEntry)=>void;onMore:()=>void}){
 const path=appsPath(query(filters,sort,null,12));
 const [state,setState]=useState<{path:string;items:CatalogEntry[];error:string}>({path:'',items:[],error:''});
 useEffect(()=>{let live=true;cached(path).then(d=>{if(live)setState({path,items:parsePage(d).items,error:''});},(e:Error)=>{if(live)setState({path,items:[],error:e.message});});return()=>{live=false;};},[path]);
 const ready=state.path===path;
 return <section className="discover-shelf">
  <div className="discover-shelf-heading"><h3>{sortLabel[sort]}</h3><button className="text-button" onClick={onMore}>Ver todo <Icon name="arrow" size={13}/></button></div>
  {!ready?<p className="installed-empty">Cargando…</p>:state.error?<p className="message error"><Icon name="info" size={16}/><span>{state.error}</span></p>:!state.items.length?<p className="installed-empty">Nada con estos filtros.</p>:
   <div className="discover-row">{state.items.map((e,i)=><Card key={e.slug} entry={e} consoles={consoles} onOpen={onOpen} index={i}/>)}</div>}
 </section>;
}

function query(f:Filters,sort:CatalogSort,cursor:string|null,limit:number):CatalogQuery{
 return {search:f.search,os:f.os||null,console:f.console||null,projectType:f.projectType||null,hideGenerated:f.hideGenerated,sort,cursor,limit};
}

function Grid({sort,filters,consoles,onOpen}:{sort:CatalogSort;filters:Filters;consoles:CatalogConsole[];onOpen:(e:CatalogEntry)=>void}){
 const key=appsPath(query(filters,sort,null,36));
 const [state,setState]=useState<{key:string;items:CatalogEntry[];cursor:string|null;loading:boolean;error:string}>({key:'',items:[],cursor:null,loading:true,error:''});
 useEffect(()=>{let live=true;
  cached(key).then(d=>{const p=parsePage(d);if(live)setState({key,items:p.items,cursor:p.nextCursor,loading:false,error:''});},(e:Error)=>{if(live)setState({key,items:[],cursor:null,loading:false,error:e.message});});
  return()=>{live=false;};},[key]);
 async function more(){
  if(!state.cursor)return;setState(s=>({...s,loading:true}));
  try{const p=parsePage(await cached(appsPath(query(filters,sort,state.cursor,36))));setState(s=>s.key===key?{...s,items:[...s.items,...p.items.filter(i=>!s.items.some(x=>x.slug===i.slug))],cursor:p.nextCursor,loading:false}:s);}
  catch(e){setState(s=>({...s,loading:false,error:(e as Error).message}));}
 }
 const ready=state.key===key;
 if(!ready)return <p className="installed-empty">Cargando…</p>;
 if(state.error&&!state.items.length)return <p className="message error"><Icon name="info" size={16}/><span>{state.error}</span></p>;
 if(!state.items.length)return <div className="empty-panel"><h3>No hay proyectos con estos filtros.</h3></div>;
 return <><div className="game-grid size-medium image-box discover-grid">{state.items.map((e,i)=><Card key={e.slug} entry={e} consoles={consoles} onOpen={onOpen} index={i%12}/>)}</div>
  {state.cursor&&<button className="secondary discover-more" disabled={state.loading} onClick={()=>void more()}>{state.loading?'Cargando…':'Cargar más'}</button>}</>;
}

export function Discover({act,busy,library}:{act:Act;busy:boolean;library:string[]}){
 const myOs=useMyOs();
 const [consoles,setConsoles]=useState<CatalogConsole[]>([]),[total,setTotal]=useState<number|null>(null);
 const [filters,setFilters]=useState<Filters>({search:'',os:'',console:'',projectType:'',hideGenerated:false});
 const [osTouched,setOsTouched]=useState(false);
 const [searchText,setSearchText]=useState('');
 const [mode,setMode]=useState<'shelves'|CatalogSort>('shelves');
 const [open,setOpen]=useState<CatalogEntry|null>(null);
 // Por defecto, solo lo que funciona en este equipo (como Quiver con «Automático»).
 const effective=useMemo(()=>({...filters,os:osTouched?filters.os:myOs}),[filters,osTouched,myOs]);
 useEffect(()=>{cached('/facets').then(d=>{setConsoles(parseConsoles(d));const t=(d as {total?:unknown}).total;setTotal(typeof t==='number'?t:null);},()=>{});},[]);
 useEffect(()=>{const t=setTimeout(()=>setFilters(f=>f.search===searchText?f:{...f,search:searchText}),350);return()=>clearTimeout(t);},[searchText]);
 const brands=[...new Set(consoles.map(c=>c.brand))];
 const grid=mode!=='shelves'||!!effective.search.trim();
 const set=(next:Partial<Filters>)=>setFilters(f=>({...f,...next}));
 return <div className="discover">
  <p className="discover-attribution"><Icon name="info" size={15}/><span>Catálogo comunitario de <a href={QUIVER_SITE} target="_blank" rel="noreferrer">quiverlauncher.com</a>{total?` · ${total.toLocaleString('es-MX')} proyectos`:''}. Recomp Radar no está afiliado a Quiver Launcher; las opiniones e información son de su comunidad.</span></p>
  <div className="filters discover-filters">
   <label className="search"><Icon name="search" size={17}/><input aria-label="Buscar en el catálogo" placeholder="Buscar juego o proyecto…" value={searchText} onChange={e=>setSearchText(e.target.value)} maxLength={80}/></label>
   <select aria-label="Consola original" value={filters.console} onChange={e=>set({console:e.target.value})}><option value="">Todas las consolas</option>{brands.map(b=><optgroup key={b} label={b}><option value={'maker:'+b}>Todo {b}</option>{consoles.filter(c=>c.brand===b).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>)}</select>
   <select aria-label="Sistema" value={effective.os} onChange={e=>{setOsTouched(true);set({os:e.target.value as CatalogOs|''});}}><option value="">Cualquier sistema</option>{(Object.keys(osLabel) as CatalogOs[]).map(o=><option key={o} value={o}>{osLabel[o]}{o===myOs?' (este equipo)':''}</option>)}</select>
   <select aria-label="Tipo de proyecto" value={filters.projectType} onChange={e=>set({projectType:e.target.value as CatalogType|''})}><option value="">Todos los tipos</option>{(Object.keys(typeLabel) as CatalogType[]).map(t=><option key={t} value={t}>{typeLabel[t]}</option>)}</select>
   <select aria-label="Orden" value={mode==='shelves'?'':mode} onChange={e=>setMode((e.target.value||'shelves') as typeof mode)}><option value="">Portada</option>{(Object.keys(sortLabel) as CatalogSort[]).map(s=><option key={s} value={s}>{sortLabel[s]}</option>)}</select>
   <label className="view-checkbox"><input type="checkbox" checked={filters.hideGenerated} onChange={e=>set({hideGenerated:e.target.checked})}/>Ocultar hechos mayormente con IA</label>
  </div>
  {grid?<>{mode!=='shelves'&&<button className="back-link text-button" onClick={()=>setMode('shelves')}><Icon name="back" size={15}/>Volver a la portada</button>}<Grid sort={mode==='shelves'?'rating':mode} filters={effective} consoles={consoles} onOpen={setOpen}/></>
   :SHELVES.map(s=><Shelf key={s} sort={s} filters={effective} consoles={consoles} onOpen={setOpen} onMore={()=>setMode(s)}/>)}
  {open&&<Detail key={open.slug} entry={open} consoles={consoles} act={act} busy={busy} library={library} onClose={()=>setOpen(null)}/>}
 </div>;
}
