'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import type {RadarEvent,Target} from '@/lib/domain';
import type {Installation} from '@/lib/library';
import type {RefreshResult} from '@/lib/sync';
import {createRefreshQueue,type RefreshJob} from '@/lib/refresh-queue';

export type Cover={repo:string;updatedAt:string};
export type RepoCheck={repo:string;releasesAt:string|null;lastSync:string|null;error:string|null};
type State={checks:RepoCheck[];targets:Target[];events:RadarEvent[];releases:RadarEvent[];installations:Installation[];covers:Cover[];rate:{remaining:number|null;limit:number|null;reset:number|null;blockedUntil:number|null};lastSync:{at:string;errors:string[];repos:string[]}|null;background:boolean;limits:{maxRepos:number}};
const initial:State={checks:[],targets:[],events:[],releases:[],installations:[],covers:[],rate:{remaining:null,limit:null,reset:null,blockedUntil:null},lastSync:null,background:false,limits:{maxRepos:6}};
type ApiResult={error?:string;state:State;result:Partial<RefreshResult>&{targetId?:string}};
export type Act=(body:Record<string,unknown>,silent?:boolean)=>Promise<boolean>;

export function useRadar() {
  const [state,setState]=useState<State>(initial),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[syncing,setSyncing]=useState(false),[waiting,setWaiting]=useState(false),[rateRetryAt,setRateRetryAt]=useState<number|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[auth,setAuth]=useState(false),[refreshTargetId,setRefreshTargetId]=useState<string|null>(null);
  const sequence=useRef(0),queue=useRef<ReturnType<typeof createRefreshQueue>|null>(null);
  const loadSnapshot=useCallback(async(signal?:AbortSignal)=>{
    const request=++sequence.current;
    const response=await fetch('/api/radar',{signal});
    const data=await response.json() as State&{error?:string};
    if(response.status===401)setAuth(true);
    if(!response.ok)throw new Error(data.error??'No se pudo abrir la biblioteca.');
    if(request===sequence.current)setState(data);
    return data;
  },[]);
  const post=useCallback(async(body:Record<string,unknown>,signal?:AbortSignal)=>{
    const request=++sequence.current;
    const response=await fetch('/api/radar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal});
    const data=await response.json() as ApiResult;
    if(response.status===401)setAuth(true);
    if(!response.ok)throw new Error(data.error??'No se pudo completar la acción.');
    if(request===sequence.current)setState(data.state);
    else await loadSnapshot(signal);
    return data;
  },[loadSnapshot]);
  const refresh=useCallback((job:RefreshJob={})=>queue.current?.request(job),[]);
  useEffect(()=>{
    const controller=new AbortController();
    const worker=createRefreshQueue({
      async run(job,signal){
        setRefreshTargetId(job.targetId??null);
        const data=await post({action:'refresh',fresh:job.fresh===true,...(job.targetId?{targetId:job.targetId}:{})},signal);
        const result=data.result as RefreshResult;
        if(result.rateLimited&&result.retryAt){setRateRetryAt(result.retryAt);setError(result.errors.join(' '));setNotice('');}
        else if(!result.busy){
          setRateRetryAt(null);
          if(!job.silent)setNotice(`${result.added} registros añadidos · ${result.changed} editados.`);
          setError(result.errors.join(' '));
        }
        return result;
      },
      status(status){setSyncing(status!=='idle');setWaiting(status==='waiting');if(status==='idle'){setRateRetryAt(null);setRefreshTargetId(null);}},
      error(value){setError(value instanceof Error?value.message:'No se pudo consultar GitHub.');},
    });
    queue.current=worker;
    async function open(){
      try{const data=await loadSnapshot(controller.signal);if(!controller.signal.aborted&&data.targets.length)worker.request({silent:true});}
      catch(value){if(!controller.signal.aborted)setError(value instanceof Error?value.message:'No hay conexión.');}
      finally{if(!controller.signal.aborted)setLoading(false);}
    }
    void open();
    const visible=()=>{if(document.visibilityState==='visible')worker.request({silent:true});};
    const timer=setInterval(visible,30*60*1000);
    document.addEventListener('visibilitychange',visible);
    return()=>{controller.abort();worker.dispose();queue.current=null;clearInterval(timer);document.removeEventListener('visibilitychange',visible);};
  },[loadSnapshot,post]);
  const act=useCallback<Act>(async(body,silent=false)=>{
    if(body.action==='refresh'){
      setError('');
      refresh({fresh:body.fresh===true,targetId:typeof body.targetId==='string'?body.targetId:undefined,silent});
      return true;
    }
    setBusy(true);setError('');
    try{
      const data=await post(body);
      if(body.action==='add'&&data.result.targetId){
        setNotice('Fuente añadida. Consultando sus novedades…');
        refresh({targetId:data.result.targetId});
      }else if(body.action==='setInstalled')setNotice('Versión instalada marcada por ti.');
      else if(body.action==='clearInstalled')setNotice('Marca de versión instalada quitada.');
      return true;
    }catch(value){setError(value instanceof Error?value.message:'Error de conexión.');return false;}
    finally{setBusy(false);}
  },[post,refresh]);
  // Cover controls only need completion, not the snapshot value.
  const reload=useCallback(async()=>{await loadSnapshot();},[loadSnapshot]);
  return {state,loading,busy,syncing,waiting,rateRetryAt,refreshTargetId,error,setError,notice,setNotice,auth,act,loadSnapshot:reload};
}
