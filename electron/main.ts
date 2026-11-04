// Proceso principal de la versión de escritorio de Recomp Radar.
// Sirve la misma app web desde http://localhost (Firebase Auth no acepta file://) y añade
// instalación y lanzamiento de juegos a través de un puente IPC validado.
import {app,BrowserWindow,dialog,ipcMain,shell,type IpcMainInvokeEvent} from 'electron';
import {createServer,type IncomingMessage,type Server,type ServerResponse} from 'node:http';
import {randomUUID} from 'node:crypto';
import {readFile,stat} from 'node:fs/promises';
import {extname,join,normalize,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createInstaller} from './installer.ts';
import {createSteamGridDb} from './steamgriddb.ts';
import {isInside,validInstallRequest,validRepo} from '../lib/desktop-install.ts';
import {AUTH_CALLBACK_PATH,LOGIN_TTL_MS,loginUrl,parseCallback,validProvider,type DesktopProvider} from '../lib/desktop-auth.ts';

const here=fileURLToPath(new URL('.',import.meta.url));
// Compilado en dist-electron/electron/main.js; la web construida vive en dist/.
const distDir=resolve(here,'..','..','dist');
const devUrl=process.env.RADAR_DEV_URL;
const PORT=Number(process.env.RADAR_PORT)||47821;
const appOrigin=devUrl?new URL(devUrl).origin:`http://localhost:${PORT}`;
const installer=createInstaller(app.getPath('userData'));
const sgdb=createSteamGridDb(app.getPath('userData'));
let server:Server|null=null,win:BrowserWindow|null=null;

// Google y GitHub bloquean el inicio de sesión desde navegadores embebidos que se identifican como Electron.
app.userAgentFallback=app.userAgentFallback.replace(/\s(?:Electron|recomp-radar)\/\S+/gi,'');

const MIME:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.json':'application/json','.woff2':'font/woff2','.ico':'image/x-icon','.webp':'image/webp'};

// Inicio de sesión pendiente en el navegador del sistema: un código de un solo uso que caduca.
let pendingLogin:{nonce:string;provider:DesktopProvider;expires:number}|null=null;
const callbackOrigin=`http://localhost:${PORT}`;

async function readBody(req:IncomingMessage,limit:number):Promise<string>{
 let size=0;const chunks:Buffer[]=[];
 for await(const chunk of req){size+=(chunk as Buffer).length;if(size>limit)throw new Error('too large');chunks.push(chunk as Buffer);}
 return Buffer.concat(chunks).toString('utf8');
}

/** Recibe la credencial OAuth desde la página de login del navegador y se la pasa a la ventana. */
async function authCallback(req:IncomingMessage,res:ServerResponse){
 const cors={'Access-Control-Allow-Origin':appOrigin,'Access-Control-Allow-Methods':'POST','Access-Control-Allow-Headers':'Content-Type','Vary':'Origin'};
 if(req.method==='OPTIONS'){res.writeHead(204,cors).end();return;}
 const reply=(status:number,error?:string)=>res.writeHead(status,{...cors,'Content-Type':'application/json'}).end(JSON.stringify(error?{ok:false,error}:{ok:true}));
 if(req.method!=='POST'||req.headers.origin!==appOrigin)return reply(403,'Origen no autorizado.');
 let parsed:ReturnType<typeof parseCallback>=null;
 try{parsed=parseCallback(JSON.parse(await readBody(req,32*1024)));}catch{}
 const pending=pendingLogin;
 if(!parsed||!pending||parsed.nonce!==pending.nonce||parsed.credential.provider!==pending.provider||Date.now()>pending.expires)return reply(400,'Este enlace de inicio de sesión ya no es válido. Vuelve a la app e inténtalo de nuevo.');
 pendingLogin=null;
 if(!win)return reply(409,'La app no está abierta.');
 win.webContents.send('radar:auth-credential',parsed.credential);
 if(win.isMinimized())win.restore();
 win.show();app.focus({steal:true});
 reply(200);
}

function startServer():Promise<void>{
 server=createServer(async(req,res)=>{
  try{
   const pathname=decodeURIComponent(new URL(req.url??'/','http://localhost').pathname);
   if(pathname===AUTH_CALLBACK_PATH)return await authCallback(req,res);
   if(devUrl){res.writeHead(404).end();return;}
   let file=normalize(join(distDir,pathname));
   if(!isInside(distDir,file,sep)){res.writeHead(403).end();return;}
   if(!(await stat(file).then(s=>s.isFile(),()=>false)))file=join(distDir,'index.html');
   res.writeHead(200,{'Content-Type':MIME[extname(file)]??'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
   res.end(await readFile(file));
  }catch{res.writeHead(500).end();}
 });
 return new Promise((ok,fail)=>{server!.once('error',fail);server!.listen(PORT,'127.0.0.1',()=>ok());});
}

/** Solo la página propia de la app puede usar el puente; ventanas emergentes o páginas externas no. */
function trusted(event:IpcMainInvokeEvent):boolean{
 try{return !!win&&event.sender===win.webContents&&new URL(event.senderFrame?.url??'').origin===appOrigin;}catch{return false;}
}

function handle(channel:string,fn:(...args:unknown[])=>Promise<unknown>|unknown){
 ipcMain.handle(channel,async(event,...args)=>{
  if(!trusted(event))return {ok:false,error:'Origen no autorizado.'};
  try{return {ok:true,value:await fn(...args)};}
  catch(e){return {ok:false,error:e instanceof Error?e.message:'Error inesperado.'};}
 });
}

const repoArg=(value:unknown)=>{if(typeof value!=='string'||!validRepo(value))throw new Error('Repositorio inválido.');return value;};

handle('radar:platform',()=>({os:installer.os,arch:process.arch==='arm64'?'ARM64':process.arch==='ia32'?'x86':'x64'}));
handle('radar:list',()=>installer.list());
handle('radar:sgdb-status',()=>sgdb.status());
handle('radar:sgdb-set-key',k=>{if(typeof k!=='string'||k.length>100)throw new Error('Clave inválida.');return sgdb.setKey(k);});
handle('radar:sgdb-clear-key',()=>sgdb.clearKey());
handle('radar:sgdb-art',(repo,terms,options)=>{
 const r=repoArg(repo);
 const list=Array.isArray(terms)?terms.filter((t):t is string=>typeof t==='string'&&t.trim().length>=2&&t.length<=80).slice(0,4):[];
 const o=(options&&typeof options==='object'?options:{}) as {force?:unknown;override?:unknown};
 const override=o.override===undefined?undefined:typeof o.override==='string'&&o.override.trim().length>=2&&o.override.length<=80?o.override.trim():null;
 return sgdb.art(r,list,{force:o.force===true,override});
});
handle('radar:start-login',async provider=>{
 if(!validProvider(provider))throw new Error('Proveedor no compatible.');
 pendingLogin={nonce:randomUUID(),provider,expires:Date.now()+LOGIN_TTL_MS};
 await shell.openExternal(loginUrl(appOrigin,provider,pendingLogin.nonce,callbackOrigin));
 return true;
});
handle('radar:install',async(value)=>{
 const request=validInstallRequest(value);
 if(!request)throw new Error('Solicitud de instalación inválida. Solo se aceptan archivos de releases de GitHub.');
 return installer.install(request,progress=>win?.webContents.send('radar:progress',progress));
});
handle('radar:launch',repo=>installer.launch(repoArg(repo)));
handle('radar:reveal',async repo=>{const error=await shell.openPath(installer.gameDir(repoArg(repo)));if(error)throw new Error(error);return true;});
handle('radar:uninstall',async repo=>{
 const r=repoArg(repo);
 const {response}=await dialog.showMessageBox(win!,{type:'warning',buttons:['Cancelar','Desinstalar'],defaultId:0,cancelId:0,message:`¿Desinstalar ${r}?`,detail:'Se borrará la carpeta del juego en este equipo. Las partidas guardadas fuera de esa carpeta no se tocan.'});
 if(response!==1)return false;
 await installer.uninstall(r);return true;
});
handle('radar:choose-executable',async repo=>{
 const r=repoArg(repo),dir=installer.gameDir(r);
 const {canceled,filePaths}=await dialog.showOpenDialog(win!,{defaultPath:dir,properties:installer.os==='macOS'?['openFile','treatPackageAsDirectory']:['openFile']});
 if(canceled||!filePaths[0])return null;
 return installer.setExecutable(r,filePaths[0]);
});

async function createWindow(){
 await startServer();
 win=new BrowserWindow({width:1280,height:860,minWidth:900,minHeight:600,backgroundColor:'#101819',title:'Recomp Radar',
  webPreferences:{preload:join(here,'preload.cjs'),contextIsolation:true,sandbox:true,nodeIntegration:false,webSecurity:true}});
 // El popup de Firebase Auth se abre dentro de la app; cualquier otro enlace va al navegador del sistema.
 win.webContents.setWindowOpenHandler(({url})=>{
  try{
   const u=new URL(url);
   // Google bloquea OAuth en navegadores embebidos: el login real va por el navegador del sistema
   // (radar:start-login). Solo el emulador local de Firebase Auth, en desarrollo, abre aquí.
   const emulatorPopup=!!devUrl&&u.origin==='http://127.0.0.1:9099'&&u.pathname.startsWith('/emulator/auth/');
   if(emulatorPopup)
    return {action:'allow',overrideBrowserWindowOptions:{width:520,height:720,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}}};
   if(u.protocol==='https:'||u.protocol==='http:')void shell.openExternal(url);
  }catch{}
  return {action:'deny'};
 });
 win.webContents.on('will-navigate',(event,url)=>{if(new URL(url).origin!==appOrigin){event.preventDefault();void shell.openExternal(url);}});
 await win.loadURL(devUrl??`${appOrigin}/`);
 win.on('closed',()=>{win=null;});
}

app.whenReady().then(createWindow).catch(e=>{dialog.showErrorBox('Recomp Radar',e instanceof Error?e.message:String(e));app.quit();});
app.on('window-all-closed',()=>{server?.close();app.quit();});
