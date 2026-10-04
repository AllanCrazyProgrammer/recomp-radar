import {env} from 'cloudflare:workers';
import {createGithubClient} from './github-client';
export {GithubError} from './github-rate';
export type {Rate} from './github-rate';
const client=()=>{if(!env.DB)throw new Error('La base de datos no está disponible.');return createGithubClient({db:env.DB});};
export const getRate=()=>client().getRate();
export const github=<T>(path:string,fresh=false,cacheMs?:number)=>client().github<T>(path,fresh,cacheMs);
