export const MAX_REPOS=6;
export const MAX_TARGETS=12;
export const CACHE_MS=30*60*1000;
export type TargetKind='repo'|'org';
export type ParsedTarget={kind:TargetKind;key:string};
export type RadarEvent={id:string;repo:string;kind:'release'|'commit'|'pr';title:string;body:string;url:string;date:string;sourceUpdated:string|null;revision:string;status:string;assets:number;firstSeen:string;detectedAt:string;read:boolean;releaseTag?:string|null;downloads?:import('./release-assets').ReleaseDownload[];priority?:number;label?:string};
export type Target={id:string;key:string;kind:TargetKind;label:string;priority:number;repos:string[];createdAt:string;lastSync:string|null;error:string|null};
export type Impact={tags:string[];reason:string;score:number;evidence:string|null};
export function parseTarget(input:string):ParsedTarget {
 let value=input.trim(); if(!value||value.length>200) throw new Error('Escribe una URL de GitHub, owner/repo o una organización.');
 if(/^https?:\/\//i.test(value)){let url:URL;try{url=new URL(value)}catch{throw new Error('URL inválida.')} if(url.protocol!=='https:'||url.hostname!=='github.com'||url.port||url.username||url.password||url.search||url.hash)throw new Error('Usa una URL https://github.com sin parámetros.'); value=url.pathname.replace(/^\/|\/$/g,'');if(value.startsWith('orgs/'))value=value.slice(5).replace(/\/repositories$/,'');}
 value=value.replace(/\.git$/,'').replace(/\/$/,'');const parts=value.split('/');
 if(parts.length>2||(parts.length===2&&!parts[1])||!parts[0]||!/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(parts[0])||(parts[1]&&!/^[a-z\d_.-]{1,100}$/i.test(parts[1]))||parts[1]==='.'||parts[1]==='..')throw new Error('Formato inválido. Ejemplo: Zelda64Recomp/Zelda64Recomp o HarbourMasters.');
 return {kind:parts.length===2?'repo':'org',key:parts.join('/').toLowerCase()};
}
export function explain(event:Pick<RadarEvent,'kind'|'title'|'body'|'status'|'assets'>):Impact {
 const readable=event.body.split('\n').filter(line=>!/(nightly\.link|<img|\/releases\/download\/)/i.test(line)).map(line=>line.replace(/<[^>]*>/g,'')).join('\n');
 const text=event.title+'\n'+readable; const rules=[
 {tag:'Rendimiento',pattern:/\b(performance|fps|framerate|frame rate|stutter|optimization|optimise|optimize|rendimiento)\b/i,reason:'La fuente menciona rendimiento. Puede afectar a la fluidez; no se han medido FPS desde Radar.'},
 {tag:'Compatibilidad',pattern:/\b(linux|windows|macos|steam deck|vulkan|opengl|directx|controller|gamepad|compatibility|compatibilidad)\b/i,reason:'La fuente menciona plataforma, gráficos o mandos. Revisa las notas para confirmar que aplica a tu equipo.'},
 {tag:'Instalación',pattern:/\b(install|installer|installation|setup|dependency|dependencies|rom|assets|instalación)\b/i,reason:'La fuente menciona instalación, dependencias o archivos del juego. Puede cambiar los pasos necesarios para jugar.'},
 {tag:'Jugabilidad',pattern:/\b(crash|softlock|save|saving|gameplay|input|bug|fix|fixed|audio|camera|texture|mod|mods)\b/i,reason:'La fuente menciona errores o funciones de juego. Revisa el detalle para saber qué problema o función afecta.'}
 ];
 const matched=rules.filter(r=>r.pattern.test(text)); const tags=matched.map(r=>r.tag);
 let reason=matched[0]?.reason??'El texto no permite determinar un efecto concreto sobre jugar. Consulta la fuente antes de actualizar.';
 if(event.kind==='release'){reason=event.status==='prerelease'?'Versión preliminar publicada: puede ser inestable. '+reason:'Versión publicada: es el punto de partida para revisar una actualización. '+reason;if(event.assets>0)tags.unshift('Descargable');}
 if(event.kind==='commit')reason+=' Es un cambio de código; no confirma una versión instalable.';
 if(event.kind==='pr')reason+=(event.status==='merged'?' PR integrada; no confirma que ya esté en una release.':event.status==='closed'?' PR cerrada sin integrar; no implica una mejora disponible.':' Propuesta en revisión; todavía no es una mejora disponible.');
 const lines=text.split('\n').map(l=>l.trim()).filter(Boolean);const evidence=lines.find(l=>matched[0]?.pattern.test(l))?.slice(0,240)??null;
 return {tags:tags.length?tags:['Desarrollo'],reason,score:event.kind==='release'?(event.status==='prerelease'?70:100):event.kind==='pr'?(event.status==='merged'?50:15):25,evidence};
}
export async function fingerprint(value:unknown){const data=new TextEncoder().encode(JSON.stringify(value));return [...new Uint8Array(await crypto.subtle.digest('SHA-256',data))].map(n=>n.toString(16).padStart(2,'0')).join('');}
export function mergeEvents(prior:RadarEvent[],incoming:RadarEvent[],now:string):RadarEvent[]{const map=new Map(prior.map(e=>[e.id,e]));for(const event of incoming){const old=map.get(event.id);map.set(event.id,{...event,firstSeen:old?.firstSeen??now,detectedAt:old&&old.revision===event.revision?old.detectedAt:now,read:!!old?.read&&old.revision===event.revision});}return [...map.values()];}

export function rateFromHeaders(status:number,headers:Headers,now=Date.now()){
 const numeric=(name:string)=>{const value=headers.get(name);if(value===null||value.trim()==='')return null;const number=Number(value);return Number.isFinite(number)&&number>=0?number:null;};
 const remaining=numeric('x-ratelimit-remaining'),limit=numeric('x-ratelimit-limit'),reset=numeric('x-ratelimit-reset');
 const retry=headers.get('retry-after');
 const seconds=retry!==null&&retry.trim()!==''?Number(retry):NaN;
 const retryAt=Number.isFinite(seconds)&&seconds>=0?now+seconds*1000:retry?Date.parse(retry):NaN;
 return {remaining,limit,reset,blockedUntil:status===403||status===429?Math.max(Number.isFinite(retryAt)?retryAt:now+60000,remaining===0?(reset??0)*1000:0,now+1000):null};
}
