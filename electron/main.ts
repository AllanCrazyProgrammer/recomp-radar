// Proceso principal de la versión de escritorio de Recomp Radar.
// Sirve la misma app web desde http://localhost (Firebase Auth no acepta file://) y añade
// instalación y lanzamiento de juegos a través de un puente IPC validado.
import {app,BrowserWindow,dialog,ipcMain,shell,type IpcMainInvokeEvent} from 'electron';
import {createServer,type Server} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {extname,join,normalize,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createInstaller} from './installer.ts';
import {isInside,validInstallRequest,validRepo} from '../lib/desktop-install.ts';

const here=fileURLToPath(new URL('.',import.meta.url));
// Compilado en dist-electron/electron/main.js; la web construida vive en dist/.
const distDir=resolve(here,'..','..','dist');
const devUrl=process.env.RADAR_DEV_URL;
const PORT=Number(process.env.RADAR_PORT)||47821;
const appOrigin=devUrl?new URL(devUrl).origin:`http://localhost:${PORT}`;
const installer=createInstaller(app.getPath('userData'));
let server:Server|null=null,win:BrowserWindow|null=null;

// Google y GitHub bloquean el inicio de sesión desde navegadores embebidos que se identifican como Electron.
app.userAgentFallback=app.userAgentFallback.replace(/\s(?:Electron|recomp-radar)\/\S+/gi,'');

const MIME:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.json':'application/json','.woff2':'font/woff2','.ico':'image/x-icon','.webp':'image/webp'};

function serveDist():Promise<void>{
 server=createServer(async(req,res)=>{
  try{
   const pathname=decodeURIComponent(new URL(req.url??'/','http://localhost').pathname);
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
 if(!devUrl)await serveDist();
 win=new BrowserWindow({width:1280,height:860,minWidth:900,minHeight:600,backgroundColor:'#101819',title:'Recomp Radar',
  webPreferences:{preload:join(here,'preload.cjs'),contextIsolation:true,sandbox:true,nodeIntegration:false,webSecurity:true}});
 // El popup de Firebase Auth se abre dentro de la app; cualquier otro enlace va al navegador del sistema.
 win.webContents.setWindowOpenHandler(({url})=>{
  try{
   const u=new URL(url);
   const authPopup=u.protocol==='https:'&&/\.(?:firebaseapp\.com|web\.app)$/.test(u.hostname)&&u.pathname.startsWith('/__/auth/');
   // Solo en desarrollo: el emulador de Firebase Auth abre su propio popup local.
   const emulatorPopup=!!devUrl&&u.origin==='http://127.0.0.1:9099'&&u.pathname.startsWith('/emulator/auth/');
   if(authPopup||emulatorPopup)
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
