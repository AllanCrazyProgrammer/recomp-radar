import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync, type SQLInputValue} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createGithubClient} from '../lib/github-client.ts';
import {GithubRateLimitError} from '../lib/github-rate.ts';
import {syncTargets,persistEvents} from '../lib/sync.ts';
import {normalize,type GithubEvent,type GithubFetch} from '../lib/github-data.ts';
import type {Target} from '../lib/domain.ts';

function fixture(count=1) {
  const sql=new DatabaseSync(':memory:');
  sql.exec(readFileSync(new URL('./fixtures/legacy-schema.sql',import.meta.url),'utf8'));
  let eventWrites=0,batches=0,reads=0;
  const prepare=(query:string)=>{
    let values:SQLInputValue[]=[];
    return {
      bind(...args:SQLInputValue[]){values=args;return this;},
      async first(){reads++;return sql.prepare(query).get(...values)??null;},
      async all(){reads++;return {results:sql.prepare(query).all(...values)};},
      async run(){if(query.includes('INSERT INTO events'))eventWrites++;return sql.prepare(query).run(...values);},
    };
  };
  const db={prepare,async batch(statements:ReturnType<typeof prepare>[]){batches++;sql.exec('BEGIN');try{const result=[];for(const statement of statements)result.push(await statement.run());sql.exec('COMMIT');return result;}catch(e){sql.exec('ROLLBACK');throw e;}}} as unknown as D1Database;
  const targets:Target[]=Array.from({length:count},(_,i)=>({id:'target-'+i,key:'owner/game'+i,kind:'repo',label:'Game '+i,priority:0,repos:['Owner/Game'+i],createdAt:'2026-01-01T00:00:00Z',lastSync:null,error:null}));
  for(const target of targets)sql.prepare('INSERT INTO targets(id,user_id,key,kind,label,repos,created_at) VALUES(?,?,?,?,?,?,?)').run(target.id,'test-user',target.key,target.kind,target.label,JSON.stringify(target.repos),target.createdAt);
  let time=1_800_000_000_000;
  return {sql,db,targets,now:()=>time,advance:(ms:number)=>{time+=ms;},stats:()=>({eventWrites,batches,reads}),listTargets:async()=>targets};
}
const release:GithubEvent={id:1,tag_name:'v1.0.0',name:'Version 1',body:'Release notes',html_url:'https://github.com/Owner/Game0/releases/tag/v1.0.0',published_at:'2026-01-01T00:00:00Z',updated_at:'2026-01-01T00:00:00Z'};
const fetcher=(fn:(path:string)=>Promise<unknown>):GithubFetch=>fn as GithubFetch;

test('a failed commit query preserves releases and still captures PRs',async()=>{
  const f=fixture();
  const github=fetcher(async path=>{if(path.includes('/commits?'))throw new Error('Network timeout');return path.includes('/releases?')?[release]:[{...release,id:2,title:'A PR',state:'open',created_at:release.published_at}];});
  const result=await syncTargets({...f,github});
  assert.equal(result.added,2);assert.equal(result.repos.length,0);assert.match(result.errors.join(' '),/commits: Network timeout/);
  assert.deepEqual(f.sql.prepare('SELECT kind FROM events ORDER BY kind').all().map(r=>r.kind),['pr','release']);
  assert.equal(f.sql.prepare("SELECT value FROM settings WHERE key='refresh-lock'").get(),undefined);
});

test('a new target is refreshed alone even when it is after the six-repository limit',async()=>{
  const f=fixture(8),calls:string[]=[];
  const result=await syncTargets({...f,github:fetcher(async path=>{calls.push(path);return [];})},{targetId:'target-7'});
  assert.deepEqual(result.repos,['Owner/Game7']);assert.equal(calls.length,3);assert.ok(calls.every(p=>p.includes('/Owner/Game7/')));
  assert.equal(f.sql.prepare("SELECT last_sync FROM targets WHERE id='target-0'").get()?.last_sync,null);
});

test('successive cycles rotate repositories, including failed repositories',async()=>{
  const f=fixture(8);
  const github=fetcher(async path=>{if(path.includes('/Game0/'))throw new Error('Unavailable');return [];});
  await syncTargets({...f,github});f.advance(1000);
  const result=await syncTargets({...f,github});
  assert.ok(result.repos.includes('Owner/Game6'));assert.ok(result.repos.includes('Owner/Game7'));
  assert.equal(f.sql.prepare("SELECT count(*) AS n FROM settings WHERE key LIKE 'repo-sync:%'").get()?.n,8);
});

test('a live legacy lock returns a retry without errors, then expires',async()=>{
  const f=fixture();let calls=0;
  f.sql.prepare("INSERT INTO settings VALUES('refresh-lock',?)").run(String(f.now()+3000));
  const github=fetcher(async()=>{calls++;return [];});
  const busy=await syncTargets({...f,github});assert.equal(busy.busy,true);assert.deepEqual(busy.errors,[]);assert.equal(calls,0);assert.equal(busy.retryAfterMs,3000);
  f.advance(3001);assert.equal((await syncTargets({...f,github})).busy,false);assert.equal(calls,3);
});

test('lease renewal keeps long cycles exclusive',async()=>{
  const f=fixture(6);let calls=0;
  const github=fetcher(async()=>{
    f.advance(10_000);calls++;
    const contender=await syncTargets({...f,github:fetcher(async()=>{throw new Error('Contender must not fetch');})});
    assert.equal(contender.busy,true);
    return [];
  });
  const result=await syncTargets({...f,github});assert.equal(result.busy,false);assert.equal(calls,18);assert.equal(result.repos.length,6);
});

test('losing a lease stops persistence and never deletes the new owner lock',async()=>{
  const f=fixture();const replacement=JSON.stringify({owner:'other-worker',expiresAt:f.now()+90_000});
  const github=fetcher(async()=>{f.sql.prepare("UPDATE settings SET value=? WHERE key='refresh-lock'").run(replacement);return [release];});
  await assert.rejects(syncTargets({...f,github}),/cambió de proceso/);
  assert.equal(f.sql.prepare('SELECT count(*) AS n FROM events').get()?.n,0);
  assert.equal(f.sql.prepare("SELECT value FROM settings WHERE key='refresh-lock'").get()?.value,replacement);
});

test('unchanged captures write zero events; edits preserve firstSeen and invalidate read revisions',async()=>{
  const f=fixture();const event=await normalize('Owner/Game0','release',release);
  await persistEvents(f.db,[event],'first');
  f.sql.prepare('INSERT INTO reads VALUES(?,?,?,?)').run('test-user',event.id,event.revision,'read');
  const before=f.stats();assert.deepEqual(await persistEvents(f.db,[event],'later'),{added:0,changed:0});
  assert.equal(f.stats().eventWrites,before.eventWrites);assert.equal(f.stats().batches,before.batches);
  const edited=await normalize('Owner/Game0','release',{...release,body:'New notes'});
  assert.deepEqual(await persistEvents(f.db,[edited],'edited'),{added:0,changed:1});
  const row=f.sql.prepare('SELECT e.first_seen,e.detected_at,e.revision,r.revision AS read_revision FROM events e JOIN reads r ON e.id=r.event_id').get();
  assert.equal(row?.first_seen,'first');assert.equal(row?.detected_at,'edited');assert.notEqual(row?.revision,row?.read_revision);
});

test('metadata-only updates are saved without marking the event unread',async()=>{
  const f=fixture();const event=await normalize('Owner/Game0','release',release);
  await persistEvents(f.db,[event],'first');
  assert.deepEqual(await persistEvents(f.db,[{...event,releaseTag:'v1.0.1',sourceUpdated:'2026-02-01'}],'later'),{added:0,changed:0});
  const row=f.sql.prepare('SELECT release_tag,detected_at,revision FROM events').get();
  assert.equal(row?.release_tag,'v1.0.1');assert.equal(row?.detected_at,'first');assert.equal(row?.revision,event.revision);
});

test('six full repositories batch 480 events and do no event writes on a repeat',async()=>{
  const f=fixture(6);
  const github=fetcher(async path=>Array.from({length:path.includes('/releases?')?20:30},(_,id)=>({...release,id})));
  const initial=await syncTargets({...f,github});assert.equal(initial.added,480);assert.equal(f.stats().eventWrites,480);assert.equal(f.stats().batches,20);
  const before=f.stats();f.advance(1000);const repeat=await syncTargets({...f,github});
  assert.equal(repeat.added,0);assert.equal(repeat.changed,0);assert.equal(f.stats().eventWrites,before.eventWrites);
  assert.ok(f.stats().reads-before.reads<100,'read queries remain bounded independently of event count');
});

test('targeted refresh rejects a target outside the authenticated user scope',async()=>{
  const f=fixture();await assert.rejects(syncTargets({...f,github:fetcher(async()=>[])},{targetId:'someone-elses-target'}),/no pertenece/);
});

test('all games get their release query before commits spend remaining quota',async()=>{
  const f=fixture(2),paths:string[]=[];
  await syncTargets({...f,github:fetcher(async path=>{paths.push(path);return [];})});
  assert.ok(paths[0].includes('/Game0/releases?'));
  assert.ok(paths[1].includes('/Game1/releases?'));
  assert.ok(paths[2].includes('/commits?'));
});

test('rate exhaustion produces one structured pause, preserves cached releases and does not advance attempts',async()=>{
  const f=fixture(2),retryAt=f.now()+600000;
  const result=await syncTargets({...f,github:fetcher(async path=>{throw new GithubRateLimitError(retryAt,path.includes('/releases?')?[release]:undefined);})});
  assert.equal(result.rateLimited,true);assert.equal(result.retryAt,retryAt);assert.deepEqual(result.errors,[]);
  assert.equal(result.added,2);assert.equal(result.repos.length,0);
  assert.equal(f.sql.prepare("SELECT count(*) AS n FROM settings WHERE key LIKE 'repo-sync:%'").get()?.n,0);
  assert.equal(f.sql.prepare('SELECT count(*) AS n FROM events').get()?.n,2);
  const target=f.sql.prepare("SELECT last_sync,error FROM targets WHERE id='target-0'").get();
  assert.equal(target?.last_sync,null);assert.equal(target?.error,'Consulta pendiente por la pausa de GitHub.');
});

test('a stored cooldown makes zero network requests and exposes expired cache without marking it fresh',async()=>{
  const f=fixture();const retryAt=f.now()+600000,path='/repos/Owner/Game0/releases?per_page=20',checkedAt=f.now()-3600000;
  f.sql.prepare("INSERT INTO settings VALUES('github-rate',?)").run(JSON.stringify({remaining:0,limit:60,reset:retryAt/1000,blockedUntil:retryAt}));
  f.sql.prepare('INSERT INTO cache(path,json,checked_at) VALUES(?,?,?)').run(path,JSON.stringify([release]),checkedAt);
  let calls=0;
  const client=createGithubClient({...f,fetch:async()=>{calls++;throw new Error('Should not fetch');}});
  await assert.rejects(client.github(path),error=>error instanceof GithubRateLimitError&&error.retryAt===retryAt&&Array.isArray(error.cachedData));
  assert.equal(calls,0);assert.equal(f.sql.prepare('SELECT checked_at FROM cache').get()?.checked_at,checkedAt);
});

test('one remaining request can load a release; the next waits and resumes after reset',async()=>{
  const f=fixture(),retryAt=f.now()+60000;
  f.sql.prepare("INSERT INTO settings VALUES('github-rate',?)").run(JSON.stringify({remaining:1,limit:60,reset:retryAt/1000,blockedUntil:null}));
  let calls=0;
  const client=createGithubClient({...f,fetch:async()=>{calls++;return Response.json([release],{headers:{'x-ratelimit-remaining':calls===1?'0':'59','x-ratelimit-limit':'60','x-ratelimit-reset':String((f.now()+60000)/1000)}});}});
  assert.equal((await client.github<unknown[]>('/first')).length,1);assert.equal(calls,1);
  await assert.rejects(client.github('/second'),GithubRateLimitError);assert.equal(calls,1);
  f.advance(60001);assert.equal((await client.github<unknown[]>('/second')).length,1);assert.equal(calls,2);
});

test('an HTTP 429 persists its deadline and blocks subsequent network attempts',async()=>{
  const f=fixture();let calls=0;
  const client=createGithubClient({...f,fetch:async()=>{calls++;return Response.json({message:'Rate limit exceeded'},{status:429,headers:{'retry-after':'120'}});}});
  await assert.rejects(client.github('/first'),error=>error instanceof GithubRateLimitError&&error.retryAt===f.now()+120000);
  await assert.rejects(client.github('/second'),GithubRateLimitError);assert.equal(calls,1);
});
