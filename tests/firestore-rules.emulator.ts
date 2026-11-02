import test from 'node:test';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,writeBatch} from 'firebase/firestore';

test('Firestore isolates user data and allows an accepted friend to read shared targets',async()=>{
 const env=await initializeTestEnvironment({projectId:'recomp-radar-rules-test',firestore:{rules:await (await import('node:fs/promises')).readFile('firestore.rules','utf8')}});
 try{const a=env.authenticatedContext('alice').firestore(),b=env.authenticatedContext('bob').firestore(),c=env.authenticatedContext('carol').firestore();
  await assertSucceeds(setDoc(doc(a,'publicProfiles/alice'),{uid:'alice',alias:'alice_user',discoverable:true,updatedAt:'now'}));await assertSucceeds(setDoc(doc(b,'publicProfiles/bob'),{uid:'bob',alias:'bob_user',discoverable:true,updatedAt:'now'}));
  await assertSucceeds(setDoc(doc(a,'users/alice/targets/game'),{id:'game',key:'a/b',kind:'repo',label:'Game',priority:1,repos:['a/b'],createdAt:'now',lastSync:null,error:null}));
  await assertFails(getDoc(doc(b,'users/alice/targets/game')));
  await assertFails(setDoc(doc(b,'users/alice/targets/injected'),{id:'injected',key:'x/y',kind:'repo',label:'Injected',priority:0,repos:['x/y'],createdAt:'now',lastSync:null,error:null}));
  await assertFails(setDoc(doc(b,'users/alice/friends/bob'),{uid:'bob',alias:'bob_user',state:'friend',requester:'bob',version:1,createdAt:'now'}));
  await assertSucceeds(setDoc(doc(b,'users/alice/friends/bob'),{uid:'bob',alias:'bob_user',state:'pending',requester:'bob',version:1,createdAt:'now'}));
  const batch=writeBatch(a);batch.update(doc(a,'users/alice/friends/bob'),{state:'friend',version:2});batch.set(doc(a,'users/bob/friends/alice'),{uid:'alice',alias:'alice_user',state:'friend',requester:'bob',version:2,createdAt:'now'});await assertSucceeds(batch.commit());
  await assertSucceeds(getDoc(doc(b,'users/alice/targets/game')));
  await assertFails(getDoc(doc(b,'users/alice/installations/game')));await assertFails(getDoc(doc(c,'users/alice/targets/game')));
 }finally{await env.cleanup();}
});
