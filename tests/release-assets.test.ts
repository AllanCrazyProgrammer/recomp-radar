import test from 'node:test';
import assert from 'node:assert/strict';
import {releaseDownloads} from '../lib/release-assets.ts';
const repo='Owner/Game',tag='V0.1.5';
const asset=(name:string,extra:Record<string,unknown>={})=>({name,size:1048576,state:'uploaded',browser_download_url:`https://github.com/${repo}/releases/download/${tag}/${encodeURIComponent(name)}`,...extra});
test('classifies published installers and separates mods from game downloads',()=>{
 const files=releaseDownloads(repo,tag,['Game-Windows.zip','Game-macOS-universal.zip','Game-x86_64.AppImage','game-arm64.apk','Game-Mods.zip','unknown.zip'].map(n=>asset(n)));
 assert.deepEqual(files.map(f=>f.platform),['Windows','macOS','Linux','Android','Otros archivos','Otros archivos']);
 assert.deepEqual(files.map(f=>f.architecture),[null,'Universal','x64','ARM64',null,null]);
 assert.equal(files[0].size,1048576);
});
test('rejects foreign hosts, repositories, tags and mismatched filenames',()=>{
 const name='Game-Windows.zip',valid=asset(name);
 const invalid=['http://github.com/Owner/Game/releases/download/V0.1.5/'+name,'https://evil.test/Owner/Game/releases/download/V0.1.5/'+name,'https://github.com/Other/Game/releases/download/V0.1.5/'+name,'https://github.com/Owner/Game/releases/download/V0.1.4/'+name,'https://github.com/Owner/Game/releases/download/V0.1.5/other.zip',valid.browser_download_url+'?redirect=x',valid.browser_download_url+'#x','https://user:secret@github.com/Owner/Game/releases/download/V0.1.5/'+name];
 assert.deepEqual(releaseDownloads(repo,tag,invalid.map(browser_download_url=>({...valid,browser_download_url}))),[]);
 assert.equal(releaseDownloads(repo.toLowerCase(),tag,[valid]).length,1);
});
test('handles malformed cache entries, escaped tags and duplicate files',()=>{
 const valid=asset('Game Windows.zip');
 const files=releaseDownloads(repo,tag,[null,{},asset(''),asset('x'.repeat(241)),asset('incomplete.zip',{state:'new'}),valid,valid,asset('size.zip',{size:NaN})]);
 assert.equal(files.length,2);assert.equal(files[1].size,0);
 assert.deepEqual(releaseDownloads(repo,tag,null),[]);
 assert.equal(releaseDownloads(repo,'build/stable',[asset('game.zip',{browser_download_url:'https://github.com/Owner/Game/releases/download/build%2Fstable/game.zip'})]).length,1);
});
