import {spanishReleases} from './spanish-releases.ts';
import type {RadarEvent} from './domain';

type Section='Cambios destacados'|'Correcciones'|'Antes de actualizar';
export type SummaryPoint={section:Section;text:string};
const clean=(value:string)=>value.replace(/!\[[^\]]*\]\([^)]*\)/g,'').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/<[^>]*>/g,'').replace(/\*\*|__|`/g,'').replace(/https?:\/\/\S+/g,'').replace(/\s+/g,' ').trim();
function excerpt(value:string){
 const sentences=value.split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚ])/);
 let result='';
 for(const sentence of sentences){if(result.length+sentence.length>360&&result)break;result+=(result?' ':'')+sentence;if(result.length>=260)break;}
 return result.length>420?result.slice(0,417).replace(/\s+\S*$/,'')+'…':result.trim();
}
/** Extract source text, without inferring effects or treating code activity as a release. */
export function sourceHash(text:string){let hash=2166136261;for(let i=0;i<text.length;i++)hash=Math.imul(hash^text.charCodeAt(i),16777619);return (hash>>>0).toString(16).padStart(8,'0');}
export function summarizeEvent(event:Pick<RadarEvent,'kind'|'title'|'body'|'status'>&{id?:string}){
 const candidates:SummaryPoint[]=[];let section:Section='Cambios destacados',skip=false,paragraph='',fenced=false,nested=false;
 const flush=()=>{const text=clean(paragraph);paragraph='';if(!skip&&text.length>24&&text!==clean(event.title)&&!/^\s*(thanks|full changelog|contributors|checksum|sha256)\b/i.test(text))candidates.push({section,text:excerpt(text)});};
 for(const line of event.body.replace(/\r/g,'').split('\n')){
  if(/^\s*```|^\s*~~~/.test(line)){flush();fenced=!fenced;continue;}if(fenced)continue;
  if(/^\s*#{1,6}\s/.test(line)){
   flush();nested=false;const heading=clean(line.replace(/^\s*#+\s*/,''));
   skip=/contributor|license|checksum|for developers|build instructions|colaboradores/i.test(heading);
   section=/known|breaking|updat|install|require|issue|warning|important|requisit|problemas|actualizar/i.test(heading)?'Antes de actualizar':/fix|correcci|bug/i.test(heading)?'Correcciones':'Cambios destacados';continue;
  }
  if(!line.trim()){flush();continue;}
  if(/<img|nightly\.link|\/releases\/download\/|^\s*\|/.test(line)){flush();continue;}
  // Keep top-level changes, not long lists of nested implementation details.
  if(/^\s{2,}[-*+]\s/.test(line)){flush();nested=true;continue;}
  if(nested&&/^\s{2,}/.test(line))continue;
  if(/^[-*+]\s|^\d+[.)]\s/.test(line)){flush();nested=false;paragraph=line.replace(/^([-*+]|\d+[.)])\s*/,'');}
  else paragraph+=' '+line.trim();
 }
 flush();
 const points:SummaryPoint[]=[];const seen=new Set<string>();
 for(const category of ['Cambios destacados','Correcciones','Antes de actualizar'] as const){
  for(const point of candidates.filter(p=>p.section===category).slice(0,2)){if(!seen.has(point.text)){points.push(point);seen.add(point.text);}}
 }
 const status=event.kind==='release'?(event.status==='prerelease'?'Versión preliminar':'Versión publicada'):event.kind==='commit'?'Cambio de código':event.status==='merged'?'PR integrada':event.status==='closed'?'PR cerrada sin integrar':'Propuesta en revisión';
 const reviewed=event.kind==='release'&&event.id?spanishReleases[event.id]:undefined;
 if(reviewed&&reviewed.bodyHash===sourceHash(event.body))return {points:reviewed.points,status,language:'es' as const};
 return {points,status,language:'source' as const};
}
