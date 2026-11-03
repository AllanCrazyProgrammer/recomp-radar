import {initializeApp,getApps} from 'firebase/app';
import {getAuth, GithubAuthProvider, GoogleAuthProvider, connectAuthEmulator} from 'firebase/auth';
import {getFirestore,connectFirestoreEmulator} from 'firebase/firestore';

const config={apiKey:import.meta.env.VITE_FIREBASE_API_KEY??import.meta.env.NEXT_PUBLIC_FIREBASE_API_KEY,authDomain:import.meta.env.VITE_FIREBASE_AUTH_DOMAIN??import.meta.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,projectId:import.meta.env.VITE_FIREBASE_PROJECT_ID??import.meta.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID??'recomp-radar-allan',appId:import.meta.env.VITE_FIREBASE_APP_ID??import.meta.env.NEXT_PUBLIC_FIREBASE_APP_ID,messagingSenderId:import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID??import.meta.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID};
export const firebaseConfigured=!!(config.apiKey&&config.authDomain&&config.appId);
const app=getApps()[0]??initializeApp(config);
export const auth=getAuth(app);export const db=getFirestore(app);
export const githubProvider=new GithubAuthProvider();githubProvider.addScope('read:user');
export const googleProvider=new GoogleAuthProvider();
let connected=false;
if(!connected&&import.meta.env.VITE_USE_FIREBASE_EMULATORS==='true'){connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});connectFirestoreEmulator(db,'127.0.0.1',8080);connected=true;}
