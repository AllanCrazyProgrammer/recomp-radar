import test from 'node:test';
import assert from 'node:assert/strict';
import {indexPage,loadIndex,toGithubReleases} from '../lib/quiver-releases.ts';
import {releaseDownloads} from '../lib/release-assets.ts';

const repo='sciaschi/CBFD-Recompiled';
const history={items:[
 {releaseId:'r6',version:'V0.1.6',releasedAt:Date.UTC(2026,9,13),notes:'# V0.1.6',prerelease:false,state:'verified',upstreamUrl:`https://github.com/${repo}/releases/tag/V0.1.6`,assets:[{filename:'ConkerRecompiled-V0.1.6-macOS.zip',size:10_900_000,url:`https://github.com/${repo}/releases/download/V0.1.6/ConkerRecompiled-V0.1.6-macOS.zip`}]},
 {releaseId:'r5',version:'V0.1.5',releasedAt:Date.UTC(2026,9,1),notes:'',prerelease:false,state:'unverified',upstreamUrl:'https://evil.test/x',assets:[]},
 {releaseId:'rb',version:'V0.1.4-bad',releasedAt:Date.UTC(2026,8,1),state:'blocked',assets:[]},
 {version:'',releasedAt:1},
]};

test('indexes GitHub repositories from the release status feed',()=>{
 const page=indexPage({items:[{provider:'github',repository:'Owner/Game',slug:'game-x'},{provider:'gitlab',repository:'a/b',slug:'c'},{provider:'github',repository:'../x',slug:'bad'}],nextCursor:'n',isDone:false});
 assert.deepEqual(page.slugs,{'owner/game':'game-x'});
 assert.equal(page.next,'n');
 assert.equal(indexPage({items:[],nextCursor:'n',isDone:true}).next,null);
});

test('loads every page of the index',async()=>{
 const calls:string[]=[];
 const get=async(path:string)=>{calls.push(path);return path.includes('cursor')?{items:[{provider:'github',repository:'b/b',slug:'b'}],isDone:true}:{items:[{provider:'github',repository:'a/a',slug:'a'}],nextCursor:'c1',isDone:false};};
 const index=await loadIndex(get);
 assert.deepEqual(index.slugs,{'a/a':'a','b/b':'b'});
 assert.equal(calls.length,2);
});

test('converts release history into GitHub-shaped releases the app already understands',()=>{
 const releases=toGithubReleases(repo,history,{'V0.1.5':'12345'});
 assert.deepEqual(releases.map(r=>r.tag_name),['V0.1.6','V0.1.5']);
 assert.equal(releases[0].id,'quiver:r6');
 assert.equal(releases[1].id,'12345','reuses the stored GitHub id for the same tag');
 assert.equal(releases[1].html_url,`https://github.com/${repo}/releases/tag/V0.1.5`,'ignores upstream URLs outside the repository');
 assert.equal(releases[0].published_at,'2026-10-13T00:00:00.000Z');
 const downloads=releaseDownloads(repo,'V0.1.6',releases[0].assets);
 assert.equal(downloads.length,1);
 assert.equal(downloads[0].platform,'macOS');
});
