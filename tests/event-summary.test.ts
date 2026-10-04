import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {summarizeEvent} from '../lib/event-summary.ts';
const base={kind:'release' as const,title:'v1.2',status:'published'};
test('reviewed public release notes show Spanish summaries and edits invalidate them',()=>{
 const fixtures=JSON.parse(readFileSync(new URL('./fixtures/release-notes.json',import.meta.url),'utf8'));
 for(const event of fixtures){
  const reviewed=summarizeEvent(event);
  assert.equal(reviewed.language,'es');assert.equal(reviewed.points.length,3);
  assert.equal(summarizeEvent({...event,body:event.body+'\nChanged release notes.'}).language,'source');
  assert.equal(summarizeEvent({...event,id:'unreviewed:release:1'}).language,'source');
  assert.equal(summarizeEvent({...event,kind:'commit'}).language,'source');
 }
});
test('extracts wrapped notes and balances features, fixes and known issues',()=>{
 const result=summarizeEvent({...base,body:'# v1.2\n\n## New\n- **Free camera.** Move the camera\n  with the right stick.\n  - Implementation details not for the summary.\n    More nested implementation details.\n- **Field of view.** Adjust the camera angle.\n\n## Fixes\n- The map no longer crashes with over 100 Pikmin.\n\n## Known issues\n- If Direct3D 12 crashes, switch to Vulkan.\n\n## Contributors\n- Thanks to everyone who helped with this release.'});
 assert.equal(result.points.length,4);
 assert.match(result.points[0].text,/camera with the right stick/);
 assert.ok(result.points.some(p=>p.section==='Correcciones'&&p.text.includes('100 Pikmin')));
 assert.ok(result.points.some(p=>p.section==='Antes de actualizar'&&p.text.includes('Vulkan')));
 assert.doesNotMatch(JSON.stringify(result.points),/Implementation|nested|Thanks/);
});
test('empty releases do not invent changes; commits remain code activity',()=>{
 assert.deepEqual(summarizeEvent({...base,body:''}).points,[]);
 assert.equal(summarizeEvent({...base,kind:'commit',body:''}).status,'Cambio de código');
});
test('removes markdown media, links and fenced code without executing source content',()=>{
 const r=summarizeEvent({...base,body:'![Windows](https://image.test/a.png)\n\n```sh\nDelete every file using this command.\n```\n\n- Fix [camera movement](https://example.com) when loading a saved game.'});
 assert.equal(r.points.length,1);assert.equal(r.points[0].text,'Fix camera movement when loading a saved game.');
});
test('preserves version numbers and filenames inside extracted sentences',()=>{
 const text='Swarming keeps all your Pikmin. A regression in 0.9. Change api_option in graphics.json in the data folder.';
 assert.equal(summarizeEvent({...base,body:text}).points[0].text,text);
});
