'use client';
// Arte de SteamGridDB en la ventana: estado compartido y peticiones (una por juego) al proceso principal.
// En la web no hay puente y todo devuelve null.
import {useEffect,useSyncExternalStore} from 'react';
import {searchTerms,type SgdbEntry} from '@/lib/steamgriddb';
import type {LibraryGame} from '@/lib/library';

type Snapshot={configured:boolean|null;entries:Record<string,SgdbEntry>;loading:Record<string,boolean>};
let snapshot:Snapshot={configured:null,entries:{},loading:{}};
const listeners=new Set<()=>void>(),requested=new Set<string>();
const id=(repo:string)=>repo.toLowerCase();
function set(next:Partial<Snapshot>){snapshot={...snapshot,...next};listeners.forEach(l=>l());}
const bridge=()=>typeof window!=='undefined'?window.radarDesktop??null:null;

export async function refreshSgdbStatus(){const b=bridge();if(!b)return;try{set({configured:(await b.sgdbStatus()).configured});}catch{set({configured:false});}}

/** Pide (o vuelve a pedir) el arte de un juego. override: nombre manual; null lo borra. */
export async function loadArt(game:Pick<LibraryGame,'repo'|'title'|'project'>,options:{force?:boolean;override?:string|null}={}){
 const b=bridge();if(!b)return;
 const key=id(game.repo);
 set({loading:{...snapshot.loading,[key]:true}});
 try{
  const entry=await b.sgdbArt(game.repo,searchTerms({title:game.title,project:game.project,repo:game.repo}),options);
  set({entries:{...snapshot.entries,[key]:entry}});
 }catch(e){set({entries:{...snapshot.entries,[key]:{repo:game.repo,art:snapshot.entries[key]?.art??null,checkedAt:0,error:e instanceof Error?e.message:'Error de SteamGridDB.'}}});}
 finally{set({loading:{...snapshot.loading,[key]:false}});}
}

export function useSgdb(){
 const state=useSyncExternalStore(l=>{listeners.add(l);return()=>{listeners.delete(l);};},()=>snapshot,()=>snapshot);
 useEffect(()=>{if(bridge()&&snapshot.configured===null)void refreshSgdbStatus();},[]);
 return bridge()?state:null;
}

/** Carga automáticamente el arte de los juegos visibles (la caché del proceso principal evita repetir peticiones). */
export function useAutoArt(games:Pick<LibraryGame,'repo'|'title'|'project'>[]){
 const s=useSgdb();
 const configured=s?.configured;
 useEffect(()=>{
  if(!configured)return;
  for(const g of games){const key=id(g.repo)+'|'+g.title;if(!requested.has(key)){requested.add(key);void loadArt(g);}}
 },[configured,games]);
}

export function resetRequested(){requested.clear();}

/** URLs para CoverArt: miniaturas en tarjetas, tamaño completo en la ficha. */
export function artImages(entry:SgdbEntry|undefined,large:boolean){
 const a=entry?.art;if(!a)return {};
 const pick=(p:{url:string;thumb:string}|null)=>p?(large?p.url:p.thumb):null;
 return {cover:pick(a.portrait),box:pick(a.landscape),header:pick(a.hero),icon:a.icon?.url??null};
}
