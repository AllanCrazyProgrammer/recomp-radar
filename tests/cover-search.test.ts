import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import jpeg from 'jpeg-js';
import {validateCover, MAX_COVER_BYTES} from '../lib/cover-image.ts';
import {assertCoverApiUrl, assertCoverUrl, fetchCoverBytes, type CoverFetch} from '../lib/cover-allowlist.ts';
import {prepareCover} from '../lib/cover-normalize.ts';
import {coverSearchTitle, findCoverOption, githubSocialOption, readmeImageBase, readmeImageOptions, searchCoverOptions} from '../lib/cover-search.ts';
import type {Target} from '../lib/domain.ts';

const png = readFileSync(new URL('./fixtures/cover-blue.png', import.meta.url));
const repo = 'owner/game';
const target = (label: string, name = repo, kind: Target['kind'] = 'repo'): Target => ({id: '1', key: name.toLowerCase(), kind, label, priority: 0, repos: [name], createdAt: 'now', lastSync: null, error: null});

function json(value: unknown, status = 200, headers: HeadersInit = {'content-type': 'application/json'}) {
  return new Response(JSON.stringify(value), {status, headers});
}

test('cover search title uses the library name, including Project Nectar', () => {
  assert.equal(coverSearchTitle('SSunnKing/Open-Nectar---Pikmin-Native-PC-Mobile-Port', [target('Otro', 'SSunnKing/Open-Nectar---Pikmin-Native-PC-Mobile-Port')]), 'Pikmin');
  assert.equal(coverSearchTitle(repo, [target('Mi juego')]), 'Mi juego');
  assert.equal(coverSearchTitle('owner/seguido', []), 'seguido');
  assert.throws(() => coverSearchTitle('/', []), /Juego inválido/);
});

test('allowlist accepts only https image and API hosts and rejects credentials, ports, IPs and foreign hosts', () => {
  assert.equal(assertCoverUrl('https://upload.wikimedia.org/wikipedia/commons/a/a.png').hostname, 'upload.wikimedia.org');
  assert.equal(assertCoverUrl('https://cdn.akamai.steamstatic.com/steam/apps/1/header.jpg').pathname, '/steam/apps/1/header.jpg');
  assert.equal(assertCoverUrl('https://github.com/user-attachments/assets/abc').pathname, '/user-attachments/assets/abc');
  assert.equal(assertCoverApiUrl('https://es.wikipedia.org/w/api.php?action=query').hostname, 'es.wikipedia.org');
  for (const url of [
    'http://upload.wikimedia.org/a.png',
    'https://user:secret@upload.wikimedia.org/a.png',
    'https://upload.wikimedia.org:444/a.png',
    'https://upload.wikimedia.org.evil.example/a.png',
    'https://evil.example/a.png',
    'https://127.0.0.1/a.png',
    'https://2130706433/a.png',
    'https://[::1]/a.png',
    'https://localhost/a.png',
    'https://github.com/owner/game/raw/main/a.png',
    'https://store.steampowered.com/api/storesearch/?term=a',
    'not a url',
  ]) assert.throws(() => assertCoverUrl(url), (error: unknown) => error instanceof Error && /válida|permitida/.test(error.message));
  assert.throws(() => assertCoverApiUrl('https://upload.wikimedia.org/a.png'));
  assert.throws(() => assertCoverApiUrl('https://es.wikipedia.org.evil.example/w/api.php'));
});

test('image download refuses redirects outside the allowlist without requesting them', async () => {
  const seen: string[] = [];
  const fetch: CoverFetch = async input => {
    seen.push(input);
    return new Response(null, {status: 302, headers: {location: 'https://127.0.0.1/secret'}});
  };
  await assert.rejects(fetchCoverBytes('https://upload.wikimedia.org/wikipedia/a.png', fetch), /fuente permitida/);
  assert.deepEqual(seen, ['https://upload.wikimedia.org/wikipedia/a.png']);
  const blocked: CoverFetch = async () => { throw new Error('no debe consultarse'); };
  await assert.rejects(fetchCoverBytes('http://169.254.169.254/latest', blocked), /no es válida|permitida/);
});

test('image download follows an allowlisted redirect and keeps the bytes', async () => {
  const fetch: CoverFetch = async input => input.endsWith('/start.png')
    ? new Response(null, {status: 302, headers: {location: 'https://upload.wikimedia.org/wikipedia/commons/ok.png'}})
    : new Response(png, {status: 200, headers: {'content-type': 'image/png'}});
  const bytes = await fetchCoverBytes('https://upload.wikimedia.org/wikipedia/start.png', fetch);
  assert.ok(Buffer.from(bytes).equals(png));
});

test('prepareCover keeps valid raster bytes and resizes an image wider than 4096px', () => {
  const original = new Uint8Array(png);
  const kept = prepareCover(original);
  assert.equal(kept.mime, 'image/png');
  assert.ok(Buffer.from(kept.bytes).equals(png));
  const width = 4200, height = 2, data = new Uint8Array(width * height * 4);
  for (let i = 0; i < data.length; i += 4) { data[i] = i % 255; data[i + 1] = 40; data[i + 2] = 90; data[i + 3] = 255; }
  const wide = prepareCover(new Uint8Array(jpeg.encode({data, width, height}, 90).data));
  const info = validateCover(wide.bytes, wide.mime);
  assert.equal(wide.mime, 'image/jpeg');
  assert.ok(info.width <= 4096 && info.height <= 4096);
  assert.ok(wide.bytes.length <= MAX_COVER_BYTES);
  assert.throws(() => prepareCover(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')), /JPG o PNG/);
});

test('search offers wikipedia, wikimedia, the followed repository and steam without trusting foreign URLs', async () => {
  const calls: string[] = [];
  const fetch: CoverFetch = async input => {
    calls.push(input);
    const url = new URL(input);
    if (url.hostname === 'es.wikipedia.org') return json({query: {pages: {'9': {title: 'Pikmin', thumbnail: {source: 'https://upload.wikimedia.org/wikipedia/commons/thumb/pikmin.png'}}}}});
    if (url.hostname === 'en.wikipedia.org') return json({query: {pages: {'4': {title: 'Pikmin (series)', thumbnail: {source: 'https://evil.example/pikmin.png'}, original: {source: 'https://upload.wikimedia.org/wikipedia/en/pikmin.jpg'}}}}});
    if (url.hostname === 'commons.wikimedia.org') return json({query: {pages: {'7': {title: 'File:Pikmin.png', imageinfo: [{mime: 'image/png', thumburl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/file.png', url: 'https://evil.example/full.png'}]}}}});
    if (url.hostname === 'store.steampowered.com') return json({items: [{id: 570, name: 'Pikmin', tiny_image: 'https://evil.example/steal.jpg'}, {id: '999', name: 'Malo'}]});
    return json({error: 'unexpected'}, 404);
  };
  const base = 'https://raw.githubusercontent.com/owner/game/main/';
  const options = await searchCoverOptions({
    title: 'Pikmin', repo, fetch,
    readme: async () => ({base, markdown: '![Portada](cover.png)\n![Fuera](https://evil.example/x.png)\n![Vector](logo.svg)\n![Ajena](https://raw.githubusercontent.com/other/repo/main/a.png)\n<img alt="Secreto" src="../secret.png">'}),
  });
  assert.ok(calls.length >= 4);
  assert.ok(calls.every(url => ['es.wikipedia.org', 'en.wikipedia.org', 'commons.wikimedia.org', 'store.steampowered.com'].includes(new URL(url).hostname)));
  assert.equal(options[0].id, 'github:social');
  assert.equal(options[0].previewUrl, githubSocialOption(repo).previewUrl);
  assert.ok(options.some(option => option.previewUrl === base + 'cover.png'));
  assert.ok(options.some(option => option.source === 'wikipedia' && option.label.startsWith('Pikmin · Wikipedia (español)') && option.id.startsWith('wiki:es:')));
  assert.ok(options.some(option => option.previewUrl.endsWith('/pikmin.jpg')));
  assert.ok(options.some(option => option.source === 'wikimedia' && option.previewUrl.endsWith('/file.png')));
  assert.deepEqual(options.filter(option => option.source === 'steam').map(option => option.id), ['steam:570:header', 'steam:570:capsule']);
  assert.ok(options.every(option => !option.id.includes('http') && !option.previewUrl.includes('evil.example') && !option.previewUrl.endsWith('.svg')));
  assert.equal(assertCoverUrl(options.find(option => option.id === 'steam:570:header')!.previewUrl).hostname, 'cdn.akamai.steamstatic.com');
  const chosen = await findCoverOption({title: 'Pikmin', repo, fetch, readme: async () => null}, 'steam:570:header');
  assert.equal(chosen.previewUrl, 'https://cdn.akamai.steamstatic.com/steam/apps/570/header.jpg');
  await assert.rejects(findCoverOption({title: 'Pikmin', repo, fetch, readme: async () => null}, 'steam:1:header'), /no está entre las opciones/);
  await assert.rejects(findCoverOption({title: 'Pikmin', repo, fetch, readme: async () => null}, 'https://evil.example/a.png'), /no está entre las opciones/);
  await assert.rejects(findCoverOption({title: 'Pikmin', repo, fetch, readme: async () => null}, 'wiki:es:../etc'), /inválida|no está entre/);
});

test('readme images stay inside the followed repository and branch', () => {
  const base = readmeImageBase(repo, 'https://raw.githubusercontent.com/owner/game/feature/name/README.md', 'README.md');
  assert.equal(base, 'https://raw.githubusercontent.com/owner/game/feature/name/');
  assert.equal(readmeImageBase(repo, 'https://raw.githubusercontent.com/owner/other/main/README.md', 'README.md'), null);
  assert.equal(readmeImageBase(repo, 'https://evil.example/owner/game/main/README.md', 'README.md'), null);
  const images = readmeImageOptions(repo, '![ok](docs/cover.jpg)\n![escape](../../../../etc/passwd)\n![a](one.jpg)\n![b](two.jpg)\n![c](three.jpg)', base!);
  assert.deepEqual(images.map(image => image.previewUrl), [
    'https://raw.githubusercontent.com/owner/game/feature/name/docs/cover.jpg',
    'https://raw.githubusercontent.com/owner/game/feature/name/one.jpg',
    'https://raw.githubusercontent.com/owner/game/feature/name/two.jpg',
  ]);
});
