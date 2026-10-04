import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync,type SQLInputValue} from 'node:sqlite';
import {extractGuide,linkedGuidePaths,safeGuideLink,GUIDE_CACHE_MS,type GuideDocument} from '../lib/repository-guide.ts';
import {loadRepositoryGuide} from '../lib/guide-loader.ts';
import {createGithubClient} from '../lib/github-client.ts';
import {GithubError,GithubRateLimitError} from '../lib/github-rate.ts';
import type {GithubFetch} from '../lib/github-data.ts';

const repo='NewOwner/FutureGame';
const document=(markdown:string,path='README.md',ref='v2'):GuideDocument=>({markdown,path,ref,url:`https://github.com/${repo}/blob/${ref}/${path}`});
const file=(text:string,path='README.md',ref='v2')=>({type:'file',encoding:'base64',content:Buffer.from(text).toString('base64'),size:Buffer.byteLength(text),path,html_url:document(text,path,ref).url});
function fixture(){
 const sql=new DatabaseSync(':memory:');sql.exec('CREATE TABLE cache(path TEXT PRIMARY KEY,json TEXT,etag TEXT,checked_at INTEGER); CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT);');
 const db={prepare(query:string){let values:SQLInputValue[]=[];return {bind(...args:SQLInputValue[]){values=args;return this;},async first(){return sql.prepare(query).get(...values)??null;},async run(){return sql.prepare(query).run(...values);}};}} as unknown as D1Database;
 let time=1_800_000_000_000;return {sql,db,now:()=>time,advance(ms:number){time+=ms;}};
}
const fetcher=(fn:(path:string)=>Promise<unknown>):GithubFetch=>fn as GithubFetch;

test('an arbitrary new repo derives installation/update steps without a game whitelist',()=>{
 const guide=extractGuide(document('# Future Game\n## Requirements\nA GPU.\n## Installation\nDownload Future.zip and select your own ROM.\n### Windows\nLaunch Future.exe.\n## Updating\nKeep future-settings.json and replace Future.exe.\n## Credits\nThanks.'));
 assert.equal(guide.install.length,2);assert.match(guide.install[1].markdown,/Future.exe/);assert.equal(guide.update.length,1);assert.match(guide.update[0].markdown,/future-settings.json/);assert.ok(!guide.install.some(s=>s.markdown.includes('Thanks.')));
});
test('developer setup/updating is not presented as binary installation/updating',()=>{
 const guide=extractGuide(document('# Game\n## Building on Windows\n### Install tools\nInstall cmake.\n### Updating\ngit pull && cmake --build .\n## Playing\nLoad your ROM.'));
 assert.deepEqual(guide.install.map(s=>s.title),['Playing']);assert.deepEqual(guide.update,[]);
});
test('fenced headings are code; setext headings and original commands survive',()=>{
 const guide=extractGuide(document('Installation\n============\n```sh\n# Updating\nchmod +x Future.AppImage\n```\n\nUpdating\n--------\nPreserve saves.'));
 assert.equal(guide.install.length,1);assert.match(guide.install[0].markdown,/# Updating\nchmod/);assert.deepEqual(guide.update.map(s=>s.markdown),['Preserve saves.']);
});
test('update paragraphs and standalone installation documents are recognized',()=>{
 const guide=extractGuide(document('# Game\n## Setup\nInstall package.\n\nTo update, install the new APK over the old one.'));
 assert.match(guide.update[0].markdown,/new APK/);
 assert.match(extractGuide(document('Run game.exe, then import your ROM.','INSTALL.md')).install[0].markdown,/game.exe/);
 assert.match(extractGuide(document('> [!NOTE]\nWondering about your save data when upgrading? You can overwrite your old version.','release-notes.md')).update[0].markdown,/overwrite your old version/);
});
test('linked documents are bounded to the same repo/ref; unsafe links are not fetched',()=>{
 const doc=document('[Installation](docs/INSTALL.md)\n[Upgrade](docs/UPGRADE.md)\n[Setup](https://evil.example/install.md)\n[Installation](https://github.com/Other/Repo/blob/v2/INSTALL.md)\n[Install](javascript:alert)\n[Update](#updating)\n[Install](docs/third.md)');
 assert.deepEqual(linkedGuidePaths(doc,repo),['docs/INSTALL.md','docs/UPGRADE.md']);assert.equal(safeGuideLink('javascript:alert(1)',doc.url),null);assert.equal(safeGuideLink('data:text/html,hello',doc.url),null);
});
test('one README plus explicitly linked guides; reopening and simultaneous cards spend no extra requests',async()=>{
 const f=fixture(),paths:string[]=[];
 const github=fetcher(async path=>{paths.push(path);return path.includes('/readme')?file('# Game\n[Install](docs/INSTALL.md)\n[Upgrade](docs/UPGRADE.md)'):path.includes('INSTALL')?file('Run future.exe.','docs/INSTALL.md'):file('Keep saves.','docs/UPGRADE.md');});
 const [a,b]=await Promise.all([loadRepositoryGuide({...f,github},repo,'v2'),loadRepositoryGuide({...f,github},repo,'v2')]);assert.deepEqual(a,b);assert.equal(paths.length,3);assert.match(a.install[0].markdown,/future.exe/);assert.match(a.update[0].markdown,/Keep saves/);
 await loadRepositoryGuide({...f,github},repo,'v2');assert.equal(paths.length,3);
 f.advance(GUIDE_CACHE_MS+1);await loadRepositoryGuide({...f,github},repo,'v2');assert.equal(paths.length,6);
});
test('a missing tag falls back to current docs and explicitly preserves the selected tag',async()=>{
 const f=fixture(),paths:string[]=[];const github=fetcher(async path=>{paths.push(path);if(path.includes('?ref='))throw new GithubError('missing',404);return file('## Installation\nCurrent steps.','README.md','main');});
 const guide=await loadRepositoryGuide({...f,github},repo,'v2');assert.equal(guide.tag,'v2');assert.equal(guide.ref,null);assert.equal(guide.documents[0].ref,'main');assert.equal(paths.length,2);
});
test('missing README is cached; there is no invented installation/update method',async()=>{
 const f=fixture();let calls=0;const github=fetcher(async()=>{calls++;throw new GithubError('missing',404);});
 const guide=await loadRepositoryGuide({...f,github},repo,'v2');await loadRepositoryGuide({...f,github},repo,'v2');assert.equal(calls,2);assert.deepEqual(guide.install,[]);assert.deepEqual(guide.update,[]);
});
test('GitHub cooldown retains an older captured guide rather than hiding it',async()=>{
 const f=fixture();const saved=await loadRepositoryGuide({...f,github:fetcher(async()=>file('## Installation\nSaved steps.'))},repo,'v2');f.advance(GUIDE_CACHE_MS+1);
 const guide=await loadRepositoryGuide({...f,github:fetcher(async()=>{throw new GithubRateLimitError(f.now()+60000);})},repo,'v2');assert.equal(guide.stale,true);assert.equal(guide.retryAt,f.now()+60000);assert.deepEqual(guide.install,saved.install);assert.equal(guide.checkedAt,saved.checkedAt);
});
test('an expired raw README is usable during cooldown even before a processed guide exists',async()=>{
 const f=fixture(),retryAt=f.now()+60000;const guide=await loadRepositoryGuide({...f,github:fetcher(async()=>{throw new GithubRateLimitError(retryAt,file('## Install\nPreviously captured steps.'));})},repo,'v2');
 assert.equal(guide.stale,true);assert.equal(guide.retryAt,retryAt);assert.match(guide.install[0].markdown,/Previously captured/);assert.equal(f.sql.prepare('SELECT count(*) AS n FROM cache').get()?.n,0);
});
test('documentation cache TTL uses conditional requests and shares the GitHub cooldown',async()=>{
 const f=fixture();let calls=0;
 const request=(async(_url:unknown,options:RequestInit)=>{calls++;if(calls===2){assert.equal(new Headers(options.headers).get('If-None-Match'),'doc-v2');return new Response(null,{status:304});}return new Response(JSON.stringify(file('## Install\nRun it.')),{headers:{etag:'doc-v2'}});}) as typeof fetch;
 const client=createGithubClient({...f,fetch:request});await client.github('/repos/'+repo+'/readme',false,GUIDE_CACHE_MS);f.advance(3600000);await client.github('/repos/'+repo+'/readme',false,GUIDE_CACHE_MS);assert.equal(calls,1);
 f.advance(GUIDE_CACHE_MS);await client.github('/repos/'+repo+'/readme',false,GUIDE_CACHE_MS);assert.equal(calls,2);
 f.advance(GUIDE_CACHE_MS+1);f.sql.prepare('INSERT OR REPLACE INTO settings VALUES(?,?)').run('github-rate',JSON.stringify({remaining:0,limit:60,reset:Math.ceil(f.now()/1000)+60,blockedUntil:null}));
 await assert.rejects(client.github('/repos/'+repo+'/readme',false,GUIDE_CACHE_MS),GithubRateLimitError);assert.equal(calls,2);
});
