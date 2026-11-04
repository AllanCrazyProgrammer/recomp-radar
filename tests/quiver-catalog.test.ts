import test from 'node:test';
import assert from 'node:assert/strict';
import {appsPath,catalogGet,parseDetail,parsePage,playerVerdict,safeImage,safeLink} from '../lib/quiver-catalog.ts';

const entry=(extra:Record<string,unknown>={})=>({slug:'banjo-recompiled',name:'Banjo-Kazooie',projectName:'Banjo: Recompiled',description:'A port',games:[{title:'Banjo-Kazooie'}],consoles:['n64'],projectType:'port',aiLevel:'assisted',supportedOS:['windows','macos','Linux','beos'],lastReleaseVersion:'v1.0',lastReleaseAt:1,recommended:20,reportIssues:2,reportBroken:0,tags:['recomp'],libraryArt:{header:'https://cdn2.steamgriddb.com/grid/abc.png',hero:'javascript:alert(1)'},artwork:'https://evil.test/x.png',...extra});

test('builds catalog queries with the documented parameters',()=>{
 assert.equal(appsPath({}),'/apps?limit=24');
 const p=new URLSearchParams(appsPath({search:' zelda ',os:'macos',console:'n64',projectType:'port',sort:'rating',hideGenerated:true,cursor:'abc',limit:500}).split('?')[1]);
 assert.deepEqual(Object.fromEntries(p),{limit:'48',search:'zelda',os:'macos',projectType:'port',console:'n64',sort:'rating',ai:'no-generated',cursor:'abc'});
 assert.equal(new URLSearchParams(appsPath({console:'maker:Nintendo'}).split('?')[1]).get('maker'),'Nintendo');
});

test('parses entries defensively and keeps only safe images',()=>{
 const page=parsePage({items:[entry(),{slug:'../x',name:'bad'},null],nextCursor:'n1',isDone:false});
 assert.equal(page.items.length,1);
 const e=page.items[0];
 assert.deepEqual(e.supportedOS,['windows','macos','linux']);
 assert.equal(e.art.header,'https://cdn2.steamgriddb.com/grid/abc.png');
 assert.equal(e.art.hero,null);
 assert.equal(e.art.icon,null);
 assert.equal(page.nextCursor,'n1');
 assert.equal(parsePage({items:[],nextCursor:'x',isDone:true}).nextCursor,null);
 assert.equal(safeImage('http://cdn2.steamgriddb.com/a.png'),null);
 assert.equal(safeLink('javascript:alert(1)'),null);
});

test('reads the repository from the app detail',()=>{
 const d=parseDetail({entry:entry(),project:{provider:'github',repository:'BanjoRecomp/BanjoRecomp',website:'https://discord.gg/x',author:'Wiseguy'},game:{title:'Banjo-Kazooie',year:1998}});
 assert.equal(d?.repository,'BanjoRecomp/BanjoRecomp');
 assert.equal(d?.year,1998);
 assert.equal(parseDetail({entry:entry(),project:{repository:'a/..'}})?.repository,null);
 assert.equal(parseDetail({}),null);
});

test('summarizes player feedback',()=>{
 assert.deepEqual(playerVerdict({recommended:20,reportIssues:2,reportBroken:0}),{label:'Funciona bien · 22 jugadores',tone:'good'});
 assert.equal(playerVerdict({recommended:1,reportIssues:0,reportBroken:3}).tone,'bad');
 assert.equal(playerVerdict({recommended:0,reportIssues:0,reportBroken:0}).tone,'none');
});

test('falls back to the direct host only when the main domain is unreachable',async()=>{
 const calls:string[]=[];
 const offline=(async(url:string)=>{calls.push(url);if(url.startsWith('https://api.quiverlauncher.com'))throw new TypeError('network');return new Response('{"ok":1}');}) as typeof fetch;
 assert.deepEqual(await catalogGet('/facets',offline),{ok:1});
 assert.equal(calls.length,2);
 const notFound=(async()=>new Response('{}',{status:404})) as typeof fetch;
 await assert.rejects(catalogGet('/apps/x',notFound),/404/);
});
