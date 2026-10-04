// Direct integration of real handlers with synthetic bindings: no sockets, UI or real databases.
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
const root=path.resolve(new URL('..',import.meta.url).pathname),dir=mkdtempSync(path.join(tmpdir(),'radar-social-api-'));
let sql=new DatabaseSync(path.join(dir,'synthetic.sqlite'));let assertions=0;
const verify=(actual,expected)=>{assert.deepEqual(actual,expected);assertions++;};
const prepare=query=>{let values=[];const execute=()=>sql.prepare(query).run(...values);return {bind(...v){values=v;return this;},async first(){return sql.prepare(query).get(...values)??null;},async all(){return {results:sql.prepare(query).all(...values)};},async run(){return {meta:execute()};},execute};};
const db={prepare,async batch(statements){sql.exec('BEGIN');try{const r=statements.map(s=>s.execute());sql.exec('COMMIT');return r;}catch(e){sql.exec('ROLLBACK');throw e;}}};
for(const name of readdirSync(root+'/drizzle').filter(n=>n.endsWith('.sql')).sort())sql.exec(readFileSync(root+'/drizzle/'+name,'utf8'));
sql.exec(readFileSync(root+'/tests/seed-library.sql','utf8'));
sql.exec("INSERT INTO settings VALUES('last-sync','{\"at\":\"old\",\"repos\":[\"PrivateOwner/Game\"],\"errors\":[]}');INSERT INTO installations VALUES('library_test_a','recompradartests/fixturegame','library-test-release-1','v1.0.0','private installed','2026-01-01',0,'2026');INSERT INTO game_covers VALUES('library_test_a','recompradartests/fixturegame','private-r2-key','image/png',42,'2026');");
const before={targets:sql.prepare('SELECT * FROM targets').all(),installs:sql.prepare('SELECT * FROM installations').all(),covers:sql.prepare('SELECT * FROM game_covers').all()};
globalThis.__socialEnv={DB:db};
await build({stdin:{contents:'export * as friends from "./app/api/friends/route.ts";export * as radar from "./app/api/radar/route.ts";export * as background from "./app/api/background/route.ts";export * as account from "./app/api/account/route.ts";',resolveDir:root,loader:'ts'},bundle:true,write:true,outfile:dir+'/handlers.mjs',platform:'node',format:'esm',alias:{'@':root},plugins:[{name:'synthetic-bindings',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'fixture'}));b.onResolve({filter:/^next\/headers$/},()=>({path:'headers',namespace:'fixture'}));b.onResolve({filter:/^next\/navigation$/},()=>({path:'navigation',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({contents:path==='env'?'export const env=globalThis.__socialEnv;':path==='headers'?'export async function headers(){return globalThis.__socialHeaders;}':'export function redirect(){throw new Error("Redirect not part of API tests");}'}));}}]});
const handlers=await import(pathToFileURL(dir+'/handlers.mjs').href);
const userA='library_test_a',userB='library_test_b';
async function call(route,user,body,expected=200,extra={}){
 const headers={'Content-Type':'application/json',Origin:'https://fixture.local',...(user?{'oai-authenticated-user-id':user,'oai-authenticated-user-email':'synthetic@sites.test'}:{}),...extra};
 for(const key of Object.keys(headers))if(headers[key]===null)delete headers[key];
 const req=new Request('https://fixture.local/api/'+route,{method:body===undefined?'GET':'POST',headers,...(body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body)})});globalThis.__socialHeaders=req.headers;
 const [name]=route.split('?'),handler=handlers[name][req.method];
 const response=await handler(req);verify(response.status,expected);verify(response.headers.get('cache-control'),'private, no-store');return response.json();
}
try{
 await call('friends',null,undefined,401);await call('friends',null,{action:'profile',alias:'none',discoverable:true},401);
 await call('friends',userA,{action:'profile',alias:'alice',discoverable:true},403,{Origin:'https://evil.example'});
 await call('friends',userA,{action:'profile',alias:'alice',discoverable:true},403,{Origin:null});
 await call('friends',userA,{action:'profile',alias:'alice',discoverable:true},415,{'Content-Type':'text/plain'});
 await call('friends',userA,'{bad',400);await call('friends',userA,'x'.repeat(2049),413);
 const a=await call('friends',userA,{action:'profile',alias:'alice',discoverable:true});const b=await call('friends',userB,{action:'profile',alias:'bob',discoverable:true});
 verify(Object.keys(a.profile).sort(),['alias','discoverable','id']);verify((await call('friends?q=bob',userA)).results[0].alias,'bob');
 await call('friends',userA,{action:'request',peer:b.profile.id,version:0,userId:userB});
 await call('friends?radar='+a.profile.id,userB,undefined,404);
 await call('friends?radar='+a.profile.id,null,undefined,401);
 await call('friends?radar='+a.profile.id+'&q=alice',userB,undefined,400);
 await call('friends',userA,{action:'accept',peer:b.profile.id,version:1},409);
 await call('friends',userB,{action:'accept',peer:a.profile.id,version:1});
 const shared=await call('friends?radar='+a.profile.id,userB);verify(shared.games,[{repo:'recompradartests/fixturegame',title:'PRUEBA LOCAL · juego ficticio',url:'https://github.com/recompradartests/fixturegame'}]);verify(Object.keys(shared).sort(),['games','profile']);verify(JSON.stringify(shared).includes('private'),false);verify(JSON.stringify(shared).includes(userA),false);
 await call('friends?radar='+a.profile.id,'third',undefined,404);
 const snapshot=await call('radar',userB);verify(snapshot.installations.length,0);verify(snapshot.covers.length,0);verify(snapshot.lastSync,null);verify(snapshot.background,false);
 const identity=await call('account',userA);verify(identity.userId,userA);verify(identity.email,undefined);await call('account',null,undefined,401);
 await call('background',null,{},409);verify(sql.prepare("SELECT value FROM settings WHERE key='background-last-run'").get(),undefined);
 // With explicit synthetic service owner, only that account's scope is consulted.
 globalThis.__socialEnv.BACKGROUND_OWNER_USER_ID='synthetic-service-owner';
 await call('background',null,{});verify(sql.prepare("SELECT value FROM settings WHERE key='last-sync:synthetic-service-owner'").get()!==undefined,true);verify(sql.prepare("SELECT value FROM settings WHERE key='last-sync:'||?").get(userA),undefined);
 await call('background',userA,{schedule:{id:'task',enabled:true,cadence:'hourly'}},403);
 await call('background',userA,{},403,{Origin:'https://evil.example'});delete globalThis.__socialEnv.BACKGROUND_OWNER_USER_ID;
 sql.close();sql=new DatabaseSync(path.join(dir,'synthetic.sqlite'));
 const persisted=await call('friends',userA);verify(persisted.relations[0].state,'friend');verify(persisted.profile.alias,'alice');
 await call('friends',userA,{action:'block',peer:b.profile.id});verify((await call('friends?q=alice',userB)).results.length,0);await call('friends',userB,{action:'request',peer:a.profile.id,version:0},400);
 await call('friends?radar='+a.profile.id,userB,undefined,404);await call('friends?radar='+b.profile.id,userA,undefined,404);
 verify(sql.prepare('SELECT * FROM targets').all(),before.targets);verify(sql.prepare('SELECT * FROM installations').all(),before.installs);verify(sql.prepare('SELECT * FROM game_covers').all(),before.covers);
 console.log(JSON.stringify({passed:true,assertions,persistence:'SQLite reopened',realDataTouched:false,handlers:'real source',bindings:'synthetic auth/D1; no Worker or HTTP server',artifactDirectory:dir},null,2));
}finally{sql.close();}
