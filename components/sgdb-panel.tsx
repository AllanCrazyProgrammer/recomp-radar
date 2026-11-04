'use client';
// Configuración y ajuste del arte automático de SteamGridDB (solo app de escritorio).
import {useState} from 'react';
import {loadArt,refreshSgdbStatus,resetRequested,useSgdb} from '@/hooks/use-sgdb';
import type {LibraryGame} from '@/lib/library';
import {Icon} from './radar-icons';

const KEY_PAGE='https://www.steamgriddb.com/profile/preferences/api';
const DISMISS='recomp-radar-sgdb-dismissed';

function KeyForm({onDone}:{onDone?:()=>void}){
 const [key,setKey]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function save(e:React.FormEvent){
  e.preventDefault();setBusy(true);setError('');
  try{await window.radarDesktop!.sgdbSetKey(key);setKey('');resetRequested();await refreshSgdbStatus();onDone?.();}
  catch(err){setError(err instanceof Error?err.message:'No se pudo guardar la clave.');}
  finally{setBusy(false);}
 }
 return <form className="sgdb-key-form" onSubmit={save}>
  <label htmlFor="sgdb-key">Clave API de SteamGridDB</label>
  <div><input id="sgdb-key" type="password" autoComplete="off" spellCheck={false} value={key} onChange={e=>setKey(e.target.value)} placeholder="32 caracteres" maxLength={64} required disabled={busy}/><button className="primary" disabled={busy||!key.trim()}>{busy?'Comprobando…':'Guardar'}</button></div>
  <small>Consíguela gratis en <a href={KEY_PAGE} target="_blank" rel="noreferrer">steamgriddb.com → Preferences → API ↗</a>. Se guarda cifrada en el llavero de este equipo y nunca sale de la app de escritorio.</small>
  {error&&<p className="form-error" role="alert">{error}</p>}
 </form>;
}

/** Aviso en la biblioteca mientras no haya clave. */
export function SgdbKeyBanner(){
 const s=useSgdb();
 const [hidden,setHidden]=useState(()=>{try{return localStorage.getItem(DISMISS)==='1';}catch{return false;}});
 if(!s||s.configured!==false||hidden)return null;
 return <section className="installed-panel sgdb-banner" aria-labelledby="sgdb-banner-title">
  <div className="installed-heading"><span className="stat-icon"><Icon name="star"/></span><div><span className="section-label">PORTADAS AUTOMÁTICAS</span><h2 id="sgdb-banner-title">Arte de SteamGridDB para toda tu biblioteca</h2></div>
   <button className="text-button" onClick={()=>{setHidden(true);try{localStorage.setItem(DISMISS,'1');}catch{}}}>Ahora no</button></div>
  <p>Con una clave gratuita, Recomp Radar busca cada juego por su nombre y usa la portada, cabecera e icono mejor votados. Tus portadas personales siguen teniendo prioridad.</p>
  <KeyForm/>
 </section>;
}

/** En la ficha: qué juego de SteamGridDB se eligió y cómo corregirlo. */
export function SgdbArtPanel({game}:{game:LibraryGame}){
 const s=useSgdb();
 const [term,setTerm]=useState(''),[editingKey,setEditingKey]=useState(false);
 if(!s)return null;
 const entry=s.entries[game.repo.toLowerCase()],loading=!!s.loading[game.repo.toLowerCase()];
 if(s.configured===false)return <section className="installed-panel sgdb-panel"><div className="installed-heading"><span className="stat-icon"><Icon name="star"/></span><div><span className="section-label">ARTE · STEAMGRIDDB</span><h2>Portadas automáticas</h2></div></div><KeyForm/></section>;
 const art=entry?.art;
 return <section className="installed-panel sgdb-panel" aria-labelledby="sgdb-title">
  <div className="installed-heading"><span className="stat-icon"><Icon name="star"/></span><div><span className="section-label">ARTE · STEAMGRIDDB</span><h2 id="sgdb-title">{loading?'Buscando arte…':art?art.name:'Sin arte encontrado'}</h2></div></div>
  {art&&<div className="sgdb-strip">{[art.portrait,art.landscape,art.hero,art.icon].map((p,i)=>p&&<img key={i} src={p.thumb} alt="" className={['portrait','landscape','hero','icon'][i]}/>)}</div>}
  <p className="installation-limit">{art?<>Encontrado buscando «{art.term}»{entry?.term?' (nombre manual)':''}. </>:'Prueba con el nombre oficial del juego. '}{entry?.error&&<strong>{entry.error} </strong>}Las imágenes son de la comunidad de SteamGridDB.</p>
  <form className="sgdb-search" onSubmit={e=>{e.preventDefault();if(term.trim().length>=2)void loadArt(game,{override:term.trim()}).then(()=>setTerm(''));}}>
   <input aria-label="Nombre para buscar en SteamGridDB" placeholder={art?.name??game.title} value={term} maxLength={80} onChange={e=>setTerm(e.target.value)} disabled={loading}/>
   <button className="secondary" disabled={loading||term.trim().length<2}><Icon name="search" size={14}/>Buscar con este nombre</button>
   {entry?.term&&<button type="button" className="secondary" disabled={loading} onClick={()=>void loadArt(game,{override:null})}>Volver a automático</button>}
   <button type="button" className="secondary" disabled={loading} onClick={()=>void loadArt(game,{force:true})}><Icon name="refresh" size={14}/>Actualizar</button>
  </form>
  {editingKey?<KeyForm onDone={()=>setEditingKey(false)}/>:<div className="sgdb-key-actions"><button className="text-button" onClick={()=>setEditingKey(true)}>Cambiar clave API</button><button className="text-button" onClick={()=>void window.radarDesktop!.sgdbClearKey().then(refreshSgdbStatus)}>Quitar clave</button></div>}
 </section>;
}
