// Local preview only. Adds the actual public Nectar project to the mock user's
// library for UI verification; it never touches the hosted Site.
import assert from 'node:assert/strict';
const base='http://127.0.0.1:5173';
const auth=await fetch(base+'/signin-with-chatgpt?return_to=/',{redirect:'manual'}),cookie=auth.headers.get('set-cookie')?.split(';')[0];assert.ok(cookie);
let response=await fetch(base+'/api/radar',{headers:{Cookie:cookie}});assert.equal(response.status,200);let state=await response.json();
const repo='SSunnKing/Open-Nectar---Pikmin-Native-PC-Mobile-Port';
if(!state.targets.some(t=>t.repos.includes(repo))){response=await fetch(base+'/api/radar',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({action:'add',input:repo,label:'Project Nectar'})});assert.equal(response.status,200);}
response=await fetch(base+'/api/radar',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({action:'refresh'})});assert.equal(response.status,200);state=(await response.json()).state;
console.log(JSON.stringify({local:true,targets:state.targets.length,nectarReleases:state.releases.filter(e=>e.repo===repo).map(e=>({id:e.id,tag:e.releaseTag,title:e.title,date:e.date,status:e.status})),rate:state.rate,errors:state.lastSync.errors},null,2));
