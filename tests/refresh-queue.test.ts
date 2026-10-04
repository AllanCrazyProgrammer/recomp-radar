import test from 'node:test';
import assert from 'node:assert/strict';
import {createRefreshQueue,type RefreshJob} from '../lib/refresh-queue.ts';
import type {RefreshResult} from '../lib/sync.ts';
const complete:RefreshResult={busy:false,added:1,changed:0,errors:[],repos:['Owner/Game']};
const busy:RefreshResult={...complete,busy:true,added:0,repos:[],retryAfterMs:3000};
const tick=()=>new Promise<void>(resolve=>setImmediate(resolve));
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return {promise,resolve};}

test('busy responses retry automatically and repeated visibility requests are coalesced',async()=>{
  const calls:RefreshJob[]=[],statuses:string[]=[],timers:{callback:()=>void;delay:number}[]=[];
  const queue=createRefreshQueue({run:async job=>{calls.push(job);return calls.length===1?busy:complete;},status:s=>statuses.push(s),error:e=>{throw e;},schedule:(callback,delay)=>{timers.push({callback,delay});return 1 as unknown as ReturnType<typeof setTimeout>;},cancel:()=>{}});
  queue.request({targetId:'new-source'});await tick();
  for(let i=0;i<10;i++)queue.request({silent:true});
  assert.equal(calls.length,1);assert.equal(timers.length,1);assert.equal(timers[0].delay,3000);assert.equal(statuses.at(-1),'waiting');
  timers[0].callback();await tick();assert.equal(calls.length,2);assert.equal(calls[1].targetId,'new-source');assert.equal(statuses.at(-1),'idle');queue.dispose();
});

test('a new repository added during an existing refresh remains queued',async()=>{
  const first=deferred<RefreshResult>(),calls:RefreshJob[]=[];
  const queue=createRefreshQueue({run:async job=>{calls.push(job);return calls.length===1?first.promise:complete;},status:()=>{},error:e=>{throw e;}});
  queue.request({silent:true});queue.request({targetId:'new-source'});queue.request({silent:true});
  assert.equal(calls.length,1);first.resolve(complete);await tick();assert.equal(calls.length,2);assert.equal(calls[1].targetId,'new-source');queue.dispose();
});

test('dispose cancels a pending retry and aborts requests',async()=>{
  let callback=()=>{};let canceled=false;let signal:AbortSignal|undefined;let calls=0;
  const queue=createRefreshQueue({run:async(_job,s)=>{signal=s;calls++;return busy;},status:()=>{},error:e=>{throw e;},schedule:cb=>{callback=cb;return 1 as unknown as ReturnType<typeof setTimeout>;},cancel:()=>{canceled=true;}});
  queue.request();await tick();queue.dispose();assert.equal(canceled,true);assert.equal(signal?.aborted,true);callback();await tick();assert.equal(calls,1);
});

test('a failed request releases the queue for a newly added repository',async()=>{
  const first=deferred<RefreshResult>();let calls=0;const errors:unknown[]=[];
  const queue=createRefreshQueue({run:async()=>{calls++;if(calls===1){await first.promise;throw new Error('Offline');}return complete;},status:()=>{},error:e=>errors.push(e)});
  queue.request();queue.request({targetId:'new-source'});first.resolve(complete);await tick();assert.equal(calls,2);assert.equal(errors.length,1);queue.dispose();
});

test('a source added while waiting goes ahead of the blocked general refresh',async()=>{
  const calls:RefreshJob[]=[],timers:(()=>void)[]=[];
  const queue=createRefreshQueue({run:async job=>{calls.push(job);return calls.length===1?busy:complete;},status:()=>{},error:e=>{throw e;},schedule:callback=>{timers.push(callback);return 1 as unknown as ReturnType<typeof setTimeout>;},cancel:()=>{}});
  queue.request({silent:true});await tick();queue.request({targetId:'new-source'});
  timers[0]();await tick();assert.equal(calls[1].targetId,'new-source');assert.equal(calls[2].targetId,undefined);queue.dispose();
});

test('GitHub cooldown waits until reset instead of retrying every few seconds',async()=>{
  let now=1000;const calls:RefreshJob[]=[],timers:{callback:()=>void;delay:number}[]=[],statuses:string[]=[];
  const queue=createRefreshQueue({now:()=>now,run:async job=>{calls.push(job);return calls.length===1?{...complete,rateLimited:true,retryAt:601000}:complete;},status:s=>statuses.push(s),error:e=>{throw e;},schedule:(callback,delay)=>{timers.push({callback,delay});return 1 as unknown as ReturnType<typeof setTimeout>;},cancel:()=>{}});
  queue.request({targetId:'conker'});await tick();
  assert.equal(timers[0].delay,601000);assert.equal(statuses.at(-1),'rate-limited');
  for(let i=0;i<5;i++)queue.request({silent:true});assert.equal(calls.length,1);
  now+=timers[0].delay;timers[0].callback();await tick();assert.equal(calls.length,2);assert.equal(calls[1].targetId,'conker');assert.equal(statuses.at(-1),'idle');queue.dispose();
});
