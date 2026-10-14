'use client';
/* eslint-disable @next/next/no-img-element -- Preview URLs are allowlisted public images chosen by the server. The saved cover is still the authenticated /api/cover response. */
import {useEffect, useId, useRef, useState} from 'react';
import {Icon} from './radar-icons';

type CoverOption = {id: string; source: 'wikipedia' | 'wikimedia' | 'github' | 'steam'; label: string; previewUrl: string};
const sourceName = {wikipedia: 'Wikipedia', wikimedia: 'Wikimedia', github: 'GitHub', steam: 'Steam'};

function OptionImage({url}: {url: string}) {
  const [broken, setBroken] = useState(false);
  if (broken || !url.startsWith('https://')) return <span className="cover-option-fallback">Sin vista previa</span>;
  return <img src={url} alt="" referrerPolicy="no-referrer" loading="lazy" onError={() => setBroken(true)}/>;
}

export function CoverSearch({repo, onChange, onError, onNotice, disabled = false}: {repo: string; onChange: () => Promise<void>; onError: (text: string) => void; onNotice: (text: string) => void; disabled?: boolean}) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading');
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<CoverOption[]>([]);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId(), descriptionId = useId();
  const requestId = useRef(0);
  useEffect(() => { if (open) dialog.current?.showModal(); }, [open]);

  async function openSearch() {
    const id = ++requestId.current;
    setOpen(true); setPhase('loading'); setOptions([]); setQuery(''); setMessage(''); onError('');
    try {
      const response = await fetch('/api/cover/search?repo=' + encodeURIComponent(repo));
      const data = await response.json() as {error?: string; query?: string; options?: CoverOption[]};
      if (requestId.current !== id) return;
      if (!response.ok) { setPhase('error'); setMessage(data.error ?? 'No se pudo buscar una portada.'); return; }
      const found = Array.isArray(data.options) ? data.options : [];
      setQuery(data.query ?? ''); setOptions(found); setPhase(found.length ? 'ready' : 'empty');
    } catch {
      if (requestId.current === id) { setPhase('error'); setMessage('No se pudo buscar una portada.'); }
    }
  }

  async function choose(option: CoverOption) {
    if (saving) return;
    setSaving(option.id); onError('');
    try {
      const response = await fetch('/api/cover/search', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({repo, option: option.id})});
      const data = await response.json() as {error?: string};
      if (!response.ok) throw new Error(data.error ?? 'No se pudo guardar la portada.');
      await onChange();
      onNotice('Portada guardada en tu biblioteca.');
      setSaving(null);
      setOpen(false);
    } catch (error) {
      setSaving(null);
      onError(error instanceof Error ? error.message : 'No se pudo guardar la portada.');
    }
  }

  function close() { if (!saving) { requestId.current++; setOpen(false); } }

  return <>
    <button type="button" className="secondary cover-search-button" aria-haspopup="dialog" disabled={disabled || saving !== null} onClick={() => void openSearch()}><Icon name="search" size={16}/>Buscar portada</button>
    {open && <dialog ref={dialog} className="modal cover-search-dialog" aria-labelledby={titleId} aria-describedby={descriptionId} aria-busy={phase === 'loading' || saving !== null} onCancel={event => { if (saving) event.preventDefault(); else close(); }} onClose={close} onClick={event => { if (event.target === event.currentTarget) close(); }}>
      <div className="modal-title"><span><Icon name="search" size={16}/>Buscar portada</span><button type="button" className="icon-button" disabled={saving !== null} onClick={close} aria-label="Cerrar"><Icon name="close"/></button></div>
      <div className="cover-search-body">
        <h2 id={titleId}>Elige una imagen para este juego.</h2>
        <p id={descriptionId}>Se busca por el nombre del juego en Wikipedia, Wikimedia, el repositorio de GitHub que sigues y Steam. La imagen elegida se descarga en el servidor y se guarda solo en tu cuenta.</p>
        <p className="cover-search-status" role="status">{phase === 'loading' ? 'Buscando portadas…' : phase === 'empty' ? 'No encontramos imágenes para este juego. Puedes subir un JPG o PNG desde tu dispositivo.' : phase === 'error' ? message : query ? `Resultados para «${query}».` : ''}</p>
        {phase === 'ready' && <ul className="cover-options" aria-label="Opciones de portada">{options.map(option => <li key={option.id}><button type="button" className="cover-option" disabled={saving !== null} onClick={() => void choose(option)}><OptionImage url={option.previewUrl}/><span>{option.label}</span><small>{sourceName[option.source]}</small><b>{saving === option.id ? 'Guardando…' : 'Usar esta portada'}</b></button></li>)}</ul>}
      </div>
    </dialog>}
  </>;
}
