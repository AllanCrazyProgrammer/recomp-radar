'use client';
// Página que se abre en el navegador del sistema cuando la app de escritorio pide iniciar sesión.
import {useState} from 'react';
import {completeDesktopLogin} from '@/lib/desktop-signin';
import type {DesktopLoginParams} from '@/lib/desktop-auth';
import {Icon} from './radar-icons';

export function DesktopLogin({params}:{params:DesktopLoginParams}){
 const [state,setState]=useState<'idle'|'working'|'done'|'error'>('idle'),[error,setError]=useState('');
 const name=params.provider==='google'?'Google':'GitHub';
 async function start(){
  setState('working');setError('');
  try{await completeDesktopLogin(params);setState('done');}
  catch(e){setError(e instanceof Error?e.message:'No se pudo iniciar sesión.');setState('error');}
 }
 return <main className="desktop-login"><section className="installed-panel">
  <div className="installed-heading"><span className="stat-icon green"><Icon name="game"/></span><div><span className="section-label">RECOMP RADAR · APP DE ESCRITORIO</span><h2>{state==='done'?'Listo. Vuelve a Recomp Radar':'Inicia sesión para la app de escritorio'}</h2></div></div>
  {state==='done'?<p>Tu sesión ya está en la app de escritorio. Puedes cerrar esta pestaña.</p>:<>
   <p>Google y GitHub no permiten iniciar sesión dentro de apps como esta, así que se hace aquí, en tu navegador. Al terminar, la sesión se envía solo a la app abierta en este equipo.</p>
   <button className="primary" disabled={state==='working'} onClick={()=>void start()}>{state==='working'?'Esperando a '+name+'…':'Continuar con '+name}</button>
  </>}
  {error&&<p className="message error" role="alert"><Icon name="info" size={16}/><span>{error}</span></p>}
 </section></main>;
}
