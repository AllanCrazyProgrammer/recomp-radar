// Inicio de sesión de la versión de escritorio a través del navegador del sistema.
// Google bloquea OAuth dentro de navegadores embebidos (Electron), así que:
//  1. La app abre el navegador en /?desktop-login=<proveedor>&nonce=<código>&cb=<origen local>.
//  2. El usuario inicia sesión allí con Firebase (popup normal del navegador).
//  3. La página envía la credencial OAuth solo al servidor local de la app, con el código de un uso.
//  4. La app inicia sesión con signInWithCredential, sin abrir ninguna ventana de Google.

export type DesktopProvider='google'|'github';
export type DesktopCredential={provider:DesktopProvider;idToken:string|null;accessToken:string|null};
export type DesktopLoginParams={provider:DesktopProvider;nonce:string;callback:string};

export const AUTH_CALLBACK_PATH='/desktop-auth/callback';
export const LOGIN_TTL_MS=10*60_000;
const NONCE=/^[0-9a-f-]{36}$/i;
const TOKEN=/^[\w.~+/=-]{10,8192}$/;

export function validProvider(value:unknown):value is DesktopProvider{return value==='google'||value==='github';}

/** El callback solo puede ser el servidor local de la app: http://localhost:<puerto> o 127.0.0.1. */
export function validCallbackOrigin(value:string):boolean{
 try{const u=new URL(value);return u.protocol==='http:'&&(u.hostname==='localhost'||u.hostname==='127.0.0.1')&&!!u.port&&u.origin===value&&!u.username&&!u.password;}catch{return false;}
}

export function loginUrl(appOrigin:string,provider:DesktopProvider,nonce:string,callback:string):string{
 const u=new URL('/',appOrigin);
 u.searchParams.set('desktop-login',provider);u.searchParams.set('nonce',nonce);u.searchParams.set('cb',callback);
 return u.href;
}

export function parseLoginParams(search:string):DesktopLoginParams|null{
 const p=new URLSearchParams(search),provider=p.get('desktop-login'),nonce=p.get('nonce')??'',callback=p.get('cb')??'';
 return validProvider(provider)&&NONCE.test(nonce)&&validCallbackOrigin(callback)?{provider,nonce,callback}:null;
}

/** Valida el cuerpo que llega al callback local. Devuelve null si falta algo o sobra tamaño. */
export function parseCallback(value:unknown):{nonce:string;credential:DesktopCredential}|null{
 if(!value||typeof value!=='object')return null;
 const v=value as Record<string,unknown>;
 if(typeof v.nonce!=='string'||!NONCE.test(v.nonce)||!validProvider(v.provider))return null;
 const idToken=typeof v.idToken==='string'&&TOKEN.test(v.idToken)?v.idToken:null;
 const accessToken=typeof v.accessToken==='string'&&TOKEN.test(v.accessToken)?v.accessToken:null;
 if(v.provider==='google'&&!idToken&&!accessToken)return null;
 if(v.provider==='github'&&!accessToken)return null;
 return {nonce:v.nonce,credential:{provider:v.provider,idToken,accessToken}};
}
