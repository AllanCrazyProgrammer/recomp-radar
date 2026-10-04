import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const base=process.env.RADAR_TEST_URL??'http://127.0.0.1:5174';
if(!['127.0.0.1','localhost','[::1]'].includes(new URL(base).hostname))throw new Error('Tests require a loopback URL.');
const repo='RecompRadarTests/FixtureGame';
let checks=0;const verify=(condition,message)=>{assert.ok(condition,message);checks++;};
const headers=user=>({'oai-authenticated-user-id':user,'oai-authenticated-user-email':user+'@sites.test'});
async function state(user){const response=await fetch(base+'/api/radar',{headers:headers(user)});assert.equal(response.status,200);return response.json();}
async function act(user,body,status=200){const response=await fetch(base+'/api/radar',{method:'POST',headers:{...headers(user),'Content-Type':'application/json'},body:JSON.stringify(body)});assert.equal(response.status,status);return response.json();}
async function upload(user,bytes,type='image/png',status=200,target=repo){const form=new FormData();form.set('repo',target);form.set('image',new File([bytes],'portada.'+(type==='image/png'?'png':'jpg'),{type}));const response=await fetch(base+'/api/cover',{method:'POST',headers:headers(user),body:form});assert.equal(response.status,status);return response.json();}
async function cover(user){return fetch(base+'/api/cover?repo='+encodeURIComponent(repo),{headers:headers(user)});}
const existing=await state('local_seedy');
verify((await fetch(base+'/api/radar')).status===401,'unauthenticated radar');
verify((await fetch(base+'/api/cover?repo='+encodeURIComponent(repo))).status===401,'unauthenticated cover');
verify((await fetch(base+'/api/cover',{method:'POST'})).status===401,'unauthenticated upload');
await act('library_test_a',{action:'setInstalled',repo,releaseId:'library-test-commit'},400);checks++;
await act('library_test_a',{action:'setInstalled',repo:'other/game',tag:'v1.0.0'},400);checks++;
await act('library_test_a',{action:'setInstalled',repo,tag:''},400);checks++;
await act('library_test_a',{action:'setInstalled',repo,releaseId:'library-test-release-1'});
verify((await state('library_test_a')).installations[0].tag==='v1.0.0','saved installed tag');
verify((await state('library_test_a')).installations[0].publishedAt==='2026-01-01T00:00:00Z','real source date snapshot');
verify((await state('library_test_b')).installations.length===0,'installed mark isolated');
await act('library_test_a',{action:'setInstalled',repo,releaseId:'library-test-release-2'});
verify((await state('library_test_a')).installations[0].tag==='v1.1.0','changed installed tag');
await act('library_test_b',{action:'setInstalled',repo,tag:'custom-build'});
verify((await state('library_test_b')).installations[0].publishedAt===null,'unknown tag stays unknown');
verify((await state('library_test_a')).installations[0].tag==='v1.1.0','second user cannot change first user');
await act('library_test_a',{action:'clearInstalled',repo});verify((await state('library_test_a')).installations.length===0,'clear mark');
verify((await state('library_test_b')).installations.length===1,'clear does not affect other user');
await act('library_test_b',{action:'clearInstalled',repo});
await act('library_test_a',{action:'setInstalled',repo,tag:'v1.0.0'});verify((await state('library_test_a')).installations[0].releaseId==='library-test-release-1','manual tag resolves known release');
await act('library_test_a',{action:'clearInstalled',repo});
const blue=readFileSync(new URL('./fixtures/cover-blue.png',import.meta.url)),green=readFileSync(new URL('./fixtures/cover-green.png',import.meta.url));
await upload('library_test_a',Buffer.from('<svg><script>alert(1)</script></svg>'),'image/svg+xml',400);checks++;
await upload('library_test_a',blue,'image/jpeg',400);checks++;
await upload('library_test_a',new Uint8Array(2*1024*1024+1),'image/png',400);checks++;
await upload('library_test_a',blue,'image/png',400,'other/game');checks++;
const badForm=new FormData();badForm.set('repo',repo);badForm.set('image',new File([blue],'x.png',{type:'image/png'}));verify((await fetch(base+'/api/cover',{method:'POST',headers:{...headers('library_test_a'),Origin:'https://evil.example'},body:badForm})).status===403,'bad upload origin');
await upload('library_test_a',blue);let response=await cover('library_test_a');verify(response.status===200,'cover served');verify(response.headers.get('content-type')==='image/png','safe raster type');verify(response.headers.get('x-content-type-options')==='nosniff','no MIME sniffing');verify(Buffer.from(await response.arrayBuffer()).equals(blue),'persisted cover bytes');
await upload('library_test_a',Buffer.from('<svg/>'),'image/svg+xml',400);verify(Buffer.from(await (await cover('library_test_a')).arrayBuffer()).equals(blue),'invalid replacement preserves cover');
const jpg=readFileSync(new URL('./fixtures/cover-blue.jpg',import.meta.url));await upload('library_test_a',jpg,'image/jpeg');verify((await cover('library_test_a')).headers.get('content-type')==='image/jpeg','JPEG supported');await upload('library_test_a',blue);
verify((await cover('library_test_b')).status===404,'private cover isolated');verify((await state('library_test_b')).covers.length===0,'metadata isolated');
await upload('library_test_b',green);verify(Buffer.from(await (await cover('library_test_a')).arrayBuffer()).equals(blue),'second user cover does not change first user');
await upload('library_test_a',green);verify(Buffer.from(await (await cover('library_test_a')).arrayBuffer()).equals(green),'replace cover');
response=await fetch(base+'/api/cover?repo='+encodeURIComponent(repo),{method:'DELETE',headers:headers('library_test_a')});verify(response.status===200,'remove cover');verify((await cover('library_test_a')).status===404,'removed cover not accessible');verify((await state('library_test_a')).covers.length===0,'removed pointer');verify((await cover('library_test_b')).status===200,'remove does not affect other user');
await fetch(base+'/api/cover?repo='+encodeURIComponent(repo),{method:'DELETE',headers:headers('library_test_b')});
const after=await state('local_seedy');verify(JSON.stringify(after.targets)===JSON.stringify(existing.targets),'existing sources preserved');verify(JSON.stringify(after.events)===JSON.stringify(existing.events),'existing history and read state preserved');
console.log(JSON.stringify({checks,installedPersistence:true,coverPersistence:true,twoUserIsolation:true,invalidUploadsRejected:true,existingDataPreserved:true},null,2));
