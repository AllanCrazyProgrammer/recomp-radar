import test from 'node:test';
import assert from 'node:assert/strict';
import {acronym,nameScore,repoHints,bestGame,bestImage,fresh,parseGames,parseImages,searchTerms,validCdnUrl,validKey,SGDB_TTL_MS} from '../lib/steamgriddb.ts';

const img=(id:number,score:number,extra:Record<string,unknown>={})=>({id,score,url:`https://cdn2.steamgriddb.com/grid/${'a'.repeat(31)}${id}.png`,thumb:`https://cdn2.steamgriddb.com/thumb/${'a'.repeat(31)}${id}.jpg`,width:600,height:900,style:['alternate'],...extra});

test('only accepts SteamGridDB CDN image URLs',()=>{
 assert.ok(validCdnUrl('https://cdn2.steamgriddb.com/grid/0123456789abcdef0123456789abcdef.png'));
 assert.ok(validCdnUrl('https://cdn2.steamgriddb.com/hero/0123456789abcdef.webp'));
 for(const bad of ['http://cdn2.steamgriddb.com/grid/0123456789abcdef.png','https://cdn2.steamgriddb.com.evil.test/grid/0123456789abcdef.png','https://cdn2.steamgriddb.com/grid/0123456789abcdef.png?x=1','https://cdn2.steamgriddb.com/grid/../x.png','javascript:alert(1)'])
  assert.equal(validCdnUrl(bad),false,bad);
 const parsed=parseImages({data:[img(1,3),{...img(2,9),url:'https://evil.test/x.png'},null]});
 assert.deepEqual(parsed.map(i=>i.id),[1]);
});

test('picks the highest scored image and prefers clean styles on ties',()=>{
 assert.equal(bestImage(parseImages({data:[img(1,2),img(2,7),img(3,5)]}))?.url,img(2,7).url);
 assert.equal(bestImage(parseImages({data:[img(1,4,{style:['white_logo']}),img(2,4)]}))?.url,img(2,4).url);
 assert.equal(bestImage([]),null);
});

test('chooses the exact game name before the first result',()=>{
 const games=parseGames({success:true,data:[{id:1,name:'Halo: Combat Evolved Anniversary',verified:true},{id:2,name:'Halo: Combat Evolved',verified:true},{id:'x',name:'bad'}]});
 assert.equal(games.length,2);
 assert.equal(bestGame(games,'Halo Combat Evolved')?.id,2);
 assert.equal(bestGame(games,'Something else')?.id,1);
 assert.equal(bestGame([],'x'),null);
});

test('uses repository acronyms to pick the right game',()=>{
 const games=parseGames({data:[{id:1,name:"Conker's Pocket Tales",verified:true},{id:2,name:"Conker's Bad Fur Day",verified:true},{id:3,name:'Conker: Live & Reloaded',verified:true}]});
 assert.equal(acronym("Conker's Bad Fur Day"),'cbfd');
 assert.deepEqual(repoHints('sciaschi/CBFD-Recompiled'),['cbfd','recompiled'].filter(w=>w.length<=8));
 assert.equal(bestGame(games,'Conker 64',repoHints('sciaschi/CBFD-Recompiled'))?.id,2);
 assert.equal(bestGame(games,'Conker 64')?.id,1);
});

test('prefers the closest name over spin-offs, mods and sequels',()=>{
 const g=(...names:string[])=>names.map((name,i)=>({id:i+1,name,verified:true}));
 assert.equal(bestGame(g('Halo: CE Mod Tools - MCC','Halo: Combat Evolved','Halo 2'),'Halo CE')?.name,'Halo: Combat Evolved');
 assert.equal(bestGame(g('Paper Mario 64 Randomizer','Paper Mario','Paper Mario: The Thousand-Year Door'),'Paper Mario 64 3ds')?.name,'Paper Mario');
 assert.equal(bestGame(g('Xenoblade Chronicles X','Xenoblade Chronicles','Xenoblade Chronicles 2'),'Xenoblade 1')?.name,'Xenoblade Chronicles');
 assert.equal(bestGame(g('Pokémon Ruby Version','Pokémon Emerald Version'),'Pokemon Emerald')?.name,'Pokémon Emerald Version');
 assert.ok(nameScore('Halo CE','Halo: Combat Evolved')>nameScore('Halo CE','Halo: CE Mod Tools - MCC'));
});

test('builds search terms from manual name, title and repository',()=>{
 assert.deepEqual(searchTerms({title:'Conker 64',project:'sciaschi/CBFD-Recompiled',repo:'sciaschi/CBFD-Recompiled'}),['Conker 64','Conker','sciaschi/CBFD-Recompiled','CBFD']);
 assert.equal(searchTerms({override:"Conker's Bad Fur Day",title:'Conker 64',project:'x',repo:'a/b'})[0],"Conker's Bad Fur Day");
});

test('validates keys and cache freshness',()=>{
 assert.ok(validKey('0123456789abcdef0123456789abcdef'));
 assert.equal(validKey('not-a-key'),false);
 const now=Date.now();
 assert.ok(fresh({repo:'a/b',art:{} as never,checkedAt:now-1000},now));
 assert.equal(fresh({repo:'a/b',art:{} as never,checkedAt:now-SGDB_TTL_MS-1},now),false);
 assert.equal(fresh({repo:'a/b',art:null,checkedAt:now-2*24*3600_000},now),false);
});
