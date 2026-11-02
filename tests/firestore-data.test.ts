import test from 'node:test';
import assert from 'node:assert/strict';
import {importMapping} from '../lib/import-mapping.ts';
import {buildImportEntries} from '../lib/import-entries.ts';

test('legacy library export mapping supplies stable identities and defaults',()=>{
 const mapped=importMapping({targets:[{key:'a/b',kind:'repo',repos:['a/b']}],events:[{id:'evt',repo:'a/b',kind:'commit'}],releases:[{id:'rel',repo:'a/b',kind:'release'}],installations:[],covers:[{repo:'a/c',url:'https://example.test/cover.jpg'}]},'2026-01-01T00:00:00.000Z');
 assert.equal(mapped.targets[0].id,'a/b');assert.equal(mapped.events[0].firstSeen,'2026-01-01T00:00:00.000Z');assert.equal(mapped.releases[0].detectedAt,'2026-01-01T00:00:00.000Z');
 const covers=importMapping({covers:[{repo:'a/b',objectKey:'old-r2'},{repo:'a/c',url:'https://example.test/cover.jpg'}]}).covers;assert.deepEqual(covers.map(x=>x.repo),['a/c']);
 const entries=buildImportEntries(mapped);assert.deepEqual(entries.map(x=>x.collection),['targets','events','events','covers']);assert.equal(entries[0].id,'a%2Fb');assert.equal(entries[3].id,'a%2Fc');
});

test('legacy targets missing optional fields get rule-valid defaults',()=>{
 const [t]=importMapping({targets:[{key:'Zelda64Recomp/Zelda64Recomp',kind:'repo',repos:['Zelda64Recomp/Zelda64Recomp'],extra:'x'}]},'2026-01-01T00:00:00.000Z').targets;
 assert.deepEqual(t,{id:'Zelda64Recomp/Zelda64Recomp',key:'Zelda64Recomp/Zelda64Recomp',kind:'repo',label:'Zelda64Recomp',priority:0,repos:['Zelda64Recomp/Zelda64Recomp'],createdAt:'2026-01-01T00:00:00.000Z',lastSync:null,error:null});
});
