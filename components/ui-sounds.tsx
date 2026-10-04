'use client';
import {useEffect,useRef,useState} from 'react';

const preferenceKey='recomp-radar-ui-sounds';
/** Short local samples; no sound plays until the user interacts. */
export function UiSounds(){
 const [enabled,setEnabled]=useState(true);
 const enabledRef=useRef(true),clickRef=useRef<HTMLAudioElement>(null);
 const keyRefs=useRef<Array<HTMLAudioElement|null>>([]),nextKey=useRef(0);
 const lastKey=useRef(0);
 function play(audio:HTMLAudioElement|null){
  if(!enabledRef.current||!audio)return;
  try{audio.volume=.24;audio.currentTime=0;void audio.play().catch(()=>{/* A blocked sound never interrupts the action. */});}catch{/* Media unavailable: the app still works. */}
 }
 useEffect(()=>{
  const frame=requestAnimationFrame(()=>{try{const active=localStorage.getItem(preferenceKey)!=='off';enabledRef.current=active;setEnabled(active);}catch{/* Default on when preferences cannot be stored. */}});
  const onClick=(event:MouseEvent)=>{
   if(!event.isTrusted||!(event.target instanceof Element))return;
   const control=event.target.closest('button,a[href],select,summary,label[for],input,textarea');
   if(!control||control.closest('[data-sound-toggle]')||control.matches(':disabled,[aria-disabled="true"]'))return;
   play(clickRef.current);
  };
  const onInput=(event:Event)=>{
   if(!event.isTrusted)return;
   const field=event.target;
   if(!(field instanceof HTMLInputElement||field instanceof HTMLTextAreaElement)||field.disabled||field.readOnly)return;
   if(field instanceof HTMLInputElement&&!['text','search','email','url','tel','number'].includes(field.type))return;
   const now=performance.now();if(now-lastKey.current<22)return;lastKey.current=now;
   // Rotate four voices so fast typing keeps each recorded key's release tail.
   const index=nextKey.current++%4;play(keyRefs.current[index]??null);
  };
  const onStorage=(event:StorageEvent)=>{if(event.key!==preferenceKey&&event.key!==null)return;const active=event.newValue!=='off';enabledRef.current=active;setEnabled(active);if(!active){clickRef.current?.pause();keyRefs.current.forEach(audio=>audio?.pause());}};
  document.addEventListener('click',onClick,true);document.addEventListener('input',onInput,true);window.addEventListener('storage',onStorage);
  return()=>{cancelAnimationFrame(frame);document.removeEventListener('click',onClick,true);document.removeEventListener('input',onInput,true);window.removeEventListener('storage',onStorage);};
 },[]);
 function toggle(){
  const active=!enabledRef.current;enabledRef.current=active;setEnabled(active);
  try{localStorage.setItem(preferenceKey,active?'on':'off');}catch{/* Preference applies for this session even without storage. */}
  if(active)play(clickRef.current);else{clickRef.current?.pause();keyRefs.current.forEach(audio=>audio?.pause());}
 }
 return <>
  <button className="sound-toggle" data-sound-toggle aria-label={enabled?'Silenciar sonidos':'Activar sonidos'} aria-pressed={enabled} title={enabled?'Sonidos activados · silenciar':'Sonidos silenciados · activar'} onClick={toggle}>
   <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true" shapeRendering="crispEdges"><path fill="currentColor" d="M1 5h3l4-4v14l-4-4H1Z"/>{enabled?<path fill="none" stroke="currentColor" strokeWidth="1.5" d="M10 5v6M13 3v10"/>:<path fill="none" stroke="currentColor" strokeWidth="1.5" d="m10 5 5 6m0-6-5 6"/>}</svg>
   <span>Sonido</span>
  </button>
  <audio ref={clickRef} data-ui-sound="click" src="/sounds/classic-click.wav" preload="auto" hidden aria-hidden="true"/>
  {[0,1,2,3].map(index=><audio key={index} ref={audio=>{keyRefs.current[index]=audio;}} data-ui-sound={`key-${index}`} src={index%2?'/sounds/mechanical-key-hard.wav':'/sounds/mechanical-key-medium.wav'} preload="auto" hidden aria-hidden="true"/>)}
 </>;
}
