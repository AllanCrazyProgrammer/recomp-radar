import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const base=process.env.RADAR_TEST_URL??'http://127.0.0.1:5174';
if(!['127.0.0.1','localhost','[::1]'].includes(new URL(base).hostname))throw new Error('Tests require a loopback URL.');
const mode=process.argv[2];if(!['prepare','verify'].includes(mode))throw new Error('Use prepare, restart the local server, then verify.');
const repo='RecompRadarTests/FixtureGame',headers={'oai-authenticated-user-id':'library_test_a','oai-authenticated-user-email':'library_test_a@sites.test'};
const bytes=readFileSync(new URL('./fixtures/cover-blue.png',import.meta.url));
if(mode==='prepare'){
 let response=await fetch(base+'/api/radar',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({action:'setInstalled',repo,releaseId:'library-test-release-1'})});assert.equal(response.status,200);
 const form=new FormData();form.set('repo',repo);form.set('image',new File([bytes],'x.png',{type:'image/png'}));response=await fetch(base+'/api/cover',{method:'POST',headers,body:form});assert.equal(response.status,200);
}else{
 const response=await fetch(base+'/api/radar',{headers});assert.equal(response.status,200);const state=await response.json();assert.equal(state.installations[0].tag,'v1.0.0');assert.equal(state.covers.length,1);
 const image=await fetch(base+'/api/cover?repo='+encodeURIComponent(repo),{headers});assert.equal(image.status,200);assert.ok(Buffer.from(await image.arrayBuffer()).equals(bytes));
 await fetch(base+'/api/radar',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({action:'clearInstalled',repo})});
 await fetch(base+'/api/cover?repo='+encodeURIComponent(repo),{method:'DELETE',headers});
}
console.log(JSON.stringify({phase:mode,persistedInstalledVersion:mode==='verify',persistedPrivateCover:mode==='verify'}));
