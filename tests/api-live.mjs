import assert from 'node:assert/strict';
const base=process.env.RADAR_TEST_URL??'http://127.0.0.1:5173';
const auth=await fetch(base+'/signin-with-chatgpt?return_to=/',{redirect:'manual'});
const cookie=auth.headers.get('set-cookie')?.split(';')[0];
assert.ok(cookie,'Local mock sign-in cookie required');
async function get(){const r=await fetch(base+'/api/radar',{headers:{Cookie:cookie}});assert.equal(r.status,200);return r.json();}
async function post(body,status=200,extra={}){const r=await fetch(base+'/api/radar',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json',...extra},body:JSON.stringify(body)});assert.equal(r.status,status);const text=await r.text();try{return JSON.parse(text)}catch{return {error:text}};}
assert.equal((await fetch(base+'/api/radar')).status,401);
await post({action:'add',input:'https://evil.example/a/b'},400);
await post({action:'refresh'},403,{Origin:'https://evil.example'});
let state=await get();assert.ok(state.targets.some(t=>t.key==='zelda64recomp/zelda64recomp'),'Add Zelda64Recomp in the test UI first');
await post({action:'add',input:'Zelda64Recomp/Zelda64Recomp'},400);
const count=state.events.length;const event=state.events.find(e=>e.kind==='release');assert.ok(event);assert.match(event.url,/^https:\/\/github.com\//);
await post({action:'read',ids:[event.id]});state=await get();assert.equal(state.events.find(e=>e.id===event.id).read,true);
const repeat=await post({action:'refresh'});assert.equal(repeat.state.events.length,count);assert.equal(repeat.result.added,0);assert.equal(repeat.result.changed,0);assert.equal(repeat.state.events.find(e=>e.id===event.id).read,true);
await post({action:'read',ids:[event.id],read:false});
await post({action:'add',input:'RecompRadarDefinitelyMissing/NoSuchRepo'},404);
const org=await post({action:'add',input:'HarbourMasters',label:'Harbour Masters'});assert.equal(org.state.targets.find(t=>t.kind==='org').repos.length,6);
const refreshed=await post({action:'refresh'});assert.ok(refreshed.result.repos.length<=6);assert.ok(refreshed.state.events.length>count);assert.ok(refreshed.result.errors.some(e=>e.includes('fuera de este ciclo')));
const priorityTarget=refreshed.state.targets.find(t=>t.kind==='org');await post({action:'priority',id:priorityTarget.id,priority:true});assert.equal((await get()).targets.find(t=>t.id===priorityTarget.id).priority,1);
console.log(JSON.stringify({checks:13,events:refreshed.state.events.length,kinds:Object.fromEntries(['release','commit','pr'].map(k=>[k,refreshed.state.events.filter(e=>e.kind===k).length])),checkedRepos:refreshed.result.repos,remaining:refreshed.state.rate.remaining,persistence:true,deduplication:true,unauthorized:401,badOrigin:403,invalidURL:400,missingRepo:404,organisation:true,partialCoverageVisible:true},null,2));
