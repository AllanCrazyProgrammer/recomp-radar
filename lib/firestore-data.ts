import {collection,doc,getDocs,writeBatch,deleteDoc,setDoc,getDoc,query,where,limit} from 'firebase/firestore';
import {db} from './firebase';
import type {RadarEvent,Target} from './domain';
import type {Installation} from './library';

export type LibraryData={targets:Target[];events:RadarEvent[];releases:RadarEvent[];installations:Installation[];covers:{repo:string;updatedAt:string;url?:string;dataUrl?:string;dataUrl2x?:string}[]};
const ref=(uid:string,path:string)=>collection(db,'users',uid,path);
export async function readLibrary(uid:string):Promise<LibraryData>{
 const [targets,events,installs,covers]=await Promise.all([getDocs(ref(uid,'targets')),getDocs(ref(uid,'events')),getDocs(ref(uid,'installations')),getDocs(ref(uid,'covers'))]);
 const ts=targets.docs.map(d=>d.data() as Target), followed=new Set(ts.flatMap(t=>t.repos.map(r=>r.toLowerCase()))), es=events.docs.map(d=>d.data() as RadarEvent).filter(e=>followed.has(e.repo.toLowerCase()));
 return {targets:ts,events:es.filter(e=>e.kind!=='release'),releases:es.filter(e=>e.kind==='release'),installations:installs.docs.map(d=>d.data() as Installation),covers:covers.docs.map(d=>d.data() as LibraryData['covers'][number])};
}
export async function saveTarget(uid:string,target:Target){await setDoc(doc(db,'users',uid,'targets',encodeURIComponent(target.id)),target);}
export async function removeTarget(uid:string,id:string){await deleteDoc(doc(db,'users',uid,'targets',encodeURIComponent(id)));}
export async function setTargetPriority(uid:string,id:string,priority:number){await setDoc(doc(db,'users',uid,'targets',encodeURIComponent(id)),{priority},{merge:true});}
export async function saveInstallation(uid:string,item:Installation){await setDoc(doc(db,'users',uid,'installations',encodeURIComponent(item.repo.toLowerCase())),item);}
export async function deleteInstallation(uid:string,repo:string){await deleteDoc(doc(db,'users',uid,'installations',encodeURIComponent(repo.toLowerCase())));}
export async function saveCover(uid:string,repo:string,value:{url?:string;dataUrl?:string;dataUrl2x?:string}){const cover=doc(db,'users',uid,'covers',encodeURIComponent(repo.toLowerCase()));if(!value.url&&!value.dataUrl&&!value.dataUrl2x){await deleteDoc(cover);return;}if(value.dataUrl2x&&!value.dataUrl)throw new Error('La imagen alternativa necesita su versión pequeña.');if((value.dataUrl?.length??0)+(value.dataUrl2x?.length??0)>180_000)throw new Error('La imagen comprimida supera el límite local de 180 KB. Usa una URL de portada.');await setDoc(cover,{repo:repo.toLowerCase(),...value,updatedAt:new Date().toISOString()});}
export {importMapping} from './import-mapping.ts';
export {buildImportEntries,type ImportEntry} from './import-entries.ts';
import {buildImportEntries} from './import-entries.ts';
export async function importLibrary(uid:string,data:LibraryData){const entries=buildImportEntries(data);for(let offset=0;offset<entries.length;offset+=450){const batch=writeBatch(db);for(const entry of entries.slice(offset,offset+450))batch.set(doc(db,'users',uid,entry.collection,entry.id),entry.data,{merge:true});await batch.commit();}}
export async function searchPublicAlias(alias:string){return getDocs(query(collection(db,'publicProfiles'),where('alias','==',alias.trim().toLowerCase()),where('discoverable','==',true),limit(1)));}
export async function getFriendDocs(uid:string){return getDocs(query(collection(db,'users',uid,'friends'),where('state','in',['pending','accepted'])));}
export async function getSharedTargets(ownerUid:string,viewerUid:string){const relation=await getDoc(doc(db,'users',ownerUid,'friends',viewerUid));if(!relation.exists()||relation.data().state!=='accepted')throw new Error('Radar no disponible.');return getDocs(ref(ownerUid,'targets'));}
