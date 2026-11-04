'use client';
// Estado compartido de la versión de escritorio: juegos instalados en este equipo y progreso en curso.
// En la web (sin window.radarDesktop) todo devuelve null y la interfaz sigue como antes.
import {useEffect,useSyncExternalStore} from 'react';
import type {InstallProgress,InstalledGame} from '@/lib/desktop-install';
import type {RadarDesktop} from '@/types/desktop';
import type {VisitorPlatform} from '@/lib/release-assets';

type Snapshot={ready:boolean;platform:VisitorPlatform|null;installed:Record<string,InstalledGame>;progress:Record<string,InstallProgress>;busy:Record<string,boolean>};
let snapshot:Snapshot={ready:false,platform:null,installed:{},progress:{},busy:{}};
const listeners=new Set<()=>void>();
let started=false;
const key=(repo:string)=>repo.toLowerCase();

function set(next:Partial<Snapshot>){snapshot={...snapshot,...next};listeners.forEach(l=>l());}
export function desktopBridge():RadarDesktop|null{return typeof window!=='undefined'&&window.radarDesktop?window.radarDesktop:null;}

export async function reloadInstalled(){
 const bridge=desktopBridge();if(!bridge)return;
 const games=await bridge.list();
 set({installed:Object.fromEntries(games.map(g=>[key(g.repo),g]))});
}
export function rememberInstalled(game:InstalledGame){set({installed:{...snapshot.installed,[key(game.repo)]:game}});}
export function forgetInstalled(repo:string){const {[key(repo)]:_,...rest}=snapshot.installed;set({installed:rest});}
export function setBusy(repo:string,value:boolean){
 const busy={...snapshot.busy,[key(repo)]:value};
 const progress={...snapshot.progress};if(!value)delete progress[key(repo)];
 set({busy,progress});
}

function start(){
 const bridge=desktopBridge();if(started||!bridge)return;started=true;
 bridge.onProgress(p=>set({progress:{...snapshot.progress,[key(p.repo)]:p}}));
 void Promise.all([bridge.platform(),bridge.list()]).then(([platform,games])=>set({ready:true,platform,installed:Object.fromEntries(games.map(g=>[key(g.repo),g]))})).catch(()=>set({ready:true}));
}

export function useDesktop(){
 useEffect(start,[]);
 const state=useSyncExternalStore(l=>{listeners.add(l);return()=>{listeners.delete(l);};},()=>snapshot,()=>snapshot);
 const bridge=desktopBridge();
 return bridge?{bridge,...state,game:(repo:string)=>state.installed[key(repo)]??null,progressFor:(repo:string)=>state.progress[key(repo)]??null,isBusy:(repo:string)=>!!state.busy[key(repo)]}:null;
}
