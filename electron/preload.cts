// Puente mínimo entre la ventana y el proceso principal. Se ejecuta con sandbox y contextIsolation:
// la página solo ve estas funciones, nunca ipcRenderer ni APIs de Node.
import {contextBridge,ipcRenderer,type IpcRendererEvent} from 'electron';

// El proceso principal responde {ok,value} o {ok:false,error} para que el mensaje llegue limpio a la interfaz.
async function call(channel:string,...args:unknown[]):Promise<unknown>{
 const result=await ipcRenderer.invoke(channel,...args) as {ok:true;value:unknown}|{ok:false;error:string};
 if(!result.ok)throw new Error(result.error);
 return result.value;
}

contextBridge.exposeInMainWorld('radarDesktop',{
 platform:()=>call('radar:platform'),
 list:()=>call('radar:list'),
 install:(request:unknown)=>call('radar:install',request),
 launch:(repo:string)=>call('radar:launch',repo),
 uninstall:(repo:string)=>call('radar:uninstall',repo),
 reveal:(repo:string)=>call('radar:reveal',repo),
 chooseExecutable:(repo:string)=>call('radar:choose-executable',repo),
 startLogin:(provider:string)=>call('radar:start-login',provider),
 onAuthCredential:(listener:(credential:unknown)=>void)=>{
  const handler=(_event:IpcRendererEvent,credential:unknown)=>listener(credential);
  ipcRenderer.on('radar:auth-credential',handler);
  return ()=>{ipcRenderer.removeListener('radar:auth-credential',handler);};
 },
 onProgress:(listener:(progress:unknown)=>void)=>{
  const handler=(_event:IpcRendererEvent,progress:unknown)=>listener(progress);
  ipcRenderer.on('radar:progress',handler);
  return ()=>{ipcRenderer.removeListener('radar:progress',handler);};
 },
});
