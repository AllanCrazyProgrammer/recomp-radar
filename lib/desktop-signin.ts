// Parte de Firebase del inicio de sesión de escritorio (ver lib/desktop-auth.ts para el flujo completo).
import {GithubAuthProvider,GoogleAuthProvider,signInWithCredential,signInWithPopup,signOut,type UserCredential} from 'firebase/auth';
import {auth,githubProvider,googleProvider} from './firebase';
import {AUTH_CALLBACK_PATH,parseCallback,type DesktopCredential,type DesktopLoginParams} from './desktop-auth';

/** En la app de escritorio: inicia sesión con la credencial OAuth que trajo el navegador. */
export async function signInWithDesktopCredential(c:DesktopCredential){
 const credential=c.provider==='google'?GoogleAuthProvider.credential(c.idToken,c.accessToken):GithubAuthProvider.credential(c.accessToken!);
 return signInWithCredential(auth,credential);
}

function credentialFrom(result:UserCredential,provider:DesktopLoginParams['provider']){
 const c=provider==='google'?GoogleAuthProvider.credentialFromResult(result):GithubAuthProvider.credentialFromResult(result);
 return {idToken:c?.idToken??null,accessToken:c?.accessToken??null};
}

/** En el navegador del sistema: inicia sesión y entrega la credencial solo al servidor local de la app. */
export async function completeDesktopLogin(params:DesktopLoginParams){
 const result=await signInWithPopup(auth,params.provider==='google'?googleProvider:githubProvider);
 const body={nonce:params.nonce,provider:params.provider,...credentialFrom(result,params.provider)};
 if(!parseCallback(body))throw new Error('El proveedor no devolvió una credencial utilizable.');
 // La sesión vive en la app de escritorio; en este navegador no hace falta conservarla.
 await signOut(auth).catch(()=>{});
 let response:Response;
 try{response=await fetch(params.callback+AUTH_CALLBACK_PATH,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});}
 catch{throw new Error('No se pudo contactar con la app de escritorio. ¿Sigue abierta?');}
 const data=await response.json().catch(()=>({})) as {error?:string};
 if(!response.ok)throw new Error(data.error??'La app de escritorio rechazó el inicio de sesión.');
}
