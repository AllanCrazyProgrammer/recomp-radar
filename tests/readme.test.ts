import test from 'node:test';
import assert from 'node:assert/strict';
import {parseInline,parseReadme,readmeUrl,safeHref} from '../lib/readme.ts';

const repo='Zelda64Recomp/Zelda64Recomp';

test('parses headings, paragraphs, lists and code fences',()=>{
 const blocks=parseReadme('# Zelda 64\n\nA **native** port.\nSecond line.\n\n- one\n- two\n\n1. first\n2. second\n\n```sh\nmake\n```\n',repo);
 assert.deepEqual(blocks.map(b=>b.kind),['heading','paragraph','list','list','code']);
 assert.equal(blocks[1].kind==='paragraph'&&blocks[1].inline.map(i=>i.text).join(''),'A native port. Second line.');
 assert.equal(blocks[3].kind==='list'&&blocks[3].ordered,true);
 assert.equal(blocks[4].kind==='code'&&blocks[4].text,'make');
});

test('drops raw HTML, comments and badges instead of rendering them',()=>{
 const blocks=parseReadme('<p align="center">\n<img src="x.png">\n</p>\n<!-- hidden -->\nText <script>alert(1)</script> here ![badge](https://img.shields.io/x)\n',repo);
 assert.equal(blocks.length,1);
 assert.equal(blocks[0].kind==='paragraph'&&blocks[0].inline.map(i=>i.text).join(''),'Text alert(1) here badge');
});

test('only allows http(s) links and resolves relative links on GitHub',()=>{
 assert.equal(safeHref('javascript:alert(1)',repo),null);
 assert.equal(safeHref('data:text/html,x',repo),null);
 assert.equal(safeHref('#install',repo),null);
 assert.equal(safeHref('docs/BUILDING.md',repo),`https://github.com/${repo}/blob/HEAD/docs/BUILDING.md`);
 const inline=parseInline('See [guide](javascript:alert(1)) and [docs](https://example.com/a)',repo);
 assert.deepEqual(inline.filter(i=>i.kind==='link').map(i=>i.kind==='link'&&i.href),['https://example.com/a']);
});

test('keeps links and code that live inside emphasis',()=>{
 const inline=parseInline('*(benchmarking [`mypy`](https://mypy-lang.org/) and `ty`)*',repo);
 assert.deepEqual(inline.map(i=>i.kind),['em','link','em','code','em']);
 assert.equal(inline[1].kind==='link'&&inline[1].href,'https://mypy-lang.org/');
 assert.equal(inline[1].text,'mypy');
});

test('builds raw README URLs only for valid repositories',()=>{
 assert.equal(readmeUrl(repo),`https://raw.githubusercontent.com/${repo}/HEAD/README.md`);
 assert.equal(readmeUrl('../x'),null);
});
