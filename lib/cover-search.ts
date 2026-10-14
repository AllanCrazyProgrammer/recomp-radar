import type {Target} from './domain';
import {buildLibrary} from './library.ts';
import {assertCoverUrl, fetchCoverJson, type CoverFetch} from './cover-allowlist.ts';

export type CoverSource = 'wikipedia' | 'wikimedia' | 'github' | 'steam';
export type CoverOption = {id: string; source: CoverSource; label: string; previewUrl: string};
export type ReadmeDocument = {markdown: string; base: string};
export type CoverSearchDeps = {
  title: string;
  repo: string;
  fetch?: CoverFetch;
  readme?: () => Promise<ReadmeDocument | null>;
};

const SOURCE_LIMIT = 8;

export function splitRepo(repo: string): [string, string] {
  const parts = repo.split('/');
  if (parts.length !== 2 || parts.some(part => !part || part === '.' || part === '..' || part.includes('..') || /[\u0000-\u001f\s?#\\/]/.test(part))) throw new Error('Juego inválido.');
  return [parts[0], parts[1]];
}

export function coverSearchTitle(repo: string, targets: Target[]) {
  const title = buildLibrary(targets, [], [], []).find(game => game.repo.toLowerCase() === repo.toLowerCase())?.title ?? repo.split('/')[1] ?? '';
  const clean = title.replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (!clean) throw new Error('Juego inválido.');
  return clean;
}

function encodeTitle(title: string) {
  const bytes = new TextEncoder().encode(title);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function wikiApi(lang: 'es' | 'en', title: string) {
  const url = new URL(`https://${lang}.wikipedia.org/w/api.php`);
  url.searchParams.set('action', 'query');
  url.searchParams.set('format', 'json');
  url.searchParams.set('utf8', '1');
  url.searchParams.set('redirects', '1');
  url.searchParams.set('generator', 'search');
  url.searchParams.set('gsrnamespace', '0');
  url.searchParams.set('gsrlimit', lang === 'es' ? '3' : '2');
  url.searchParams.set('gsrsearch', title);
  url.searchParams.set('prop', 'pageimages');
  url.searchParams.set('piprop', 'thumbnail|original');
  url.searchParams.set('pithumbsize', '800');
  return url.toString();
}

function commonsApi(title: string) {
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  url.searchParams.set('action', 'query');
  url.searchParams.set('format', 'json');
  url.searchParams.set('utf8', '1');
  url.searchParams.set('generator', 'search');
  url.searchParams.set('gsrnamespace', '6');
  url.searchParams.set('gsrlimit', '2');
  url.searchParams.set('gsrsearch', title);
  url.searchParams.set('prop', 'imageinfo');
  url.searchParams.set('iiprop', 'url|mime');
  url.searchParams.set('iiurlwidth', '800');
  return url.toString();
}

function steamApi(title: string) {
  const url = new URL('https://store.steampowered.com/api/storesearch/');
  url.searchParams.set('term', title);
  url.searchParams.set('l', 'spanish');
  url.searchParams.set('cc', 'es');
  return url.toString();
}

function pages(payload: unknown) {
  if (!payload || typeof payload !== 'object') return [];
  const query = (payload as {query?: {pages?: unknown}}).query;
  if (!query?.pages || typeof query.pages !== 'object') return [];
  return Object.values(query.pages as Record<string, unknown>).filter((page): page is Record<string, unknown> => !!page && typeof page === 'object');
}

function wikimediaImage(value: unknown, base: string) {
  if (typeof value !== 'string' || value.length > 4000) return null;
  try {
    const url = assertCoverUrl(new URL(value, base).toString());
    if (url.hostname !== 'upload.wikimedia.org' || /\.(svg|gif|webp)$/i.test(url.pathname)) return null;
    return url.toString();
  } catch { return null; }
}

function wikiOptions(lang: 'es' | 'en', payload: unknown, limit: number): CoverOption[] {
  const options: CoverOption[] = [];
  const sorted = pages(payload).sort((a, b) => String(a.title ?? '').localeCompare(String(b.title ?? ''), 'es'));
  for (const page of sorted) {
    if (typeof page.title !== 'string' || !page.title || page.title.length > 180) continue;
    const thumb = page.thumbnail && typeof page.thumbnail === 'object' ? (page.thumbnail as {source?: unknown}).source : undefined;
    const original = page.original && typeof page.original === 'object' ? (page.original as {source?: unknown}).source : undefined;
    const image = wikimediaImage(thumb, `https://${lang}.wikipedia.org/`) ?? wikimediaImage(original, `https://${lang}.wikipedia.org/`);
    if (!image) continue;
    options.push({
      id: `wiki:${lang}:${encodeTitle(page.title)}`,
      source: 'wikipedia',
      label: `${page.title} · Wikipedia (${lang === 'es' ? 'español' : 'inglés'})`,
      previewUrl: image,
    });
    if (options.length >= limit) break;
  }
  return options;
}

function commonsOptions(payload: unknown): CoverOption[] {
  const options: CoverOption[] = [];
  for (const page of pages(payload)) {
    if (typeof page.title !== 'string' || page.title.length > 180) continue;
    const info = Array.isArray(page.imageinfo) ? page.imageinfo[0] as {mime?: unknown; thumburl?: unknown; url?: unknown} | undefined : undefined;
    if (!info || (info.mime !== 'image/jpeg' && info.mime !== 'image/png')) continue;
    const image = wikimediaImage(info.thumburl, 'https://commons.wikimedia.org/') ?? wikimediaImage(info.url, 'https://commons.wikimedia.org/');
    if (!image) continue;
    const name = page.title.replace(/^File:/, '').replace(/^Archivo:/, '');
    options.push({id: `commons:${encodeTitle(page.title)}`, source: 'wikimedia', label: `${name} · Wikimedia Commons`, previewUrl: image});
    if (options.length >= 2) break;
  }
  return options;
}

function steamOptions(payload: unknown): CoverOption[] {
  const items = payload && typeof payload === 'object' && Array.isArray((payload as {items?: unknown}).items) ? (payload as {items: unknown[]}).items : [];
  const options: CoverOption[] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const id = (item as {id?: unknown}).id;
    const name = (item as {name?: unknown}).name;
    if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0 || id > 100_000_000) continue;
    if (typeof name !== 'string' || !name.trim() || name.length > 120) continue;
    const images = [
      ['header', 'cabecera', `https://cdn.akamai.steamstatic.com/steam/apps/${id}/header.jpg`],
      ['capsule', 'cápsula', `https://cdn.akamai.steamstatic.com/steam/apps/${id}/capsule_616x353.jpg`],
    ] as const;
    for (const [kind, label, previewUrl] of images) {
      options.push({id: `steam:${id}:${kind}`, source: 'steam', label: `${name.trim()} · Steam (${label})`, previewUrl: assertCoverUrl(previewUrl).toString()});
    }
    if (options.length >= 4) break;
  }
  return options.slice(0, 4);
}

export function githubSocialOption(repo: string): CoverOption {
  const [owner, name] = splitRepo(repo);
  const previewUrl = assertCoverUrl(`https://opengraph.githubassets.com/1/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`).toString();
  return {id: 'github:social', source: 'github', label: 'Vista previa del repositorio en GitHub', previewUrl};
}

export function readmeImageBase(repo: string, downloadUrl: string, path: string) {
  if (!path || path.startsWith('/') || path.includes('..')) return null;
  let url: URL;
  try { url = assertCoverUrl(downloadUrl); } catch { return null; }
  if (url.hostname !== 'raw.githubusercontent.com') return null;
  const [owner, name] = splitRepo(repo);
  let pathname = url.pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch { return null; }
  const prefix = `/${owner}/${name}/`;
  if (!pathname.startsWith(prefix) || pathname.includes('..')) return null;
  const rest = pathname.slice(prefix.length);
  if (!rest.endsWith('/' + path)) return null;
  const branch = rest.slice(0, -(path.length + 1));
  if (!branch || branch.split('/').some(part => !part || part === '.' || part === '..')) return null;
  return `https://raw.githubusercontent.com/${[owner, name, ...branch.split('/')].map(encodeURIComponent).join('/')}/`;
}

function skipExtension(pathname: string) {
  return /\.(svg|gif|webp|html?|md|pdf|zip)$/i.test(pathname);
}

function resolveReadmeUrl(base: string, raw: string) {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 2000 || /^(?:javascript|data|blob|file):/i.test(trimmed)) return null;
  let url: URL;
  try { url = new URL(trimmed, base); } catch { return null; }
  try { url = assertCoverUrl(url.toString()); } catch { return null; }
  if (skipExtension(url.pathname)) return null;
  const baseUrl = new URL(base);
  if (url.hostname === 'raw.githubusercontent.com') {
    const prefix = baseUrl.pathname.endsWith('/') ? baseUrl.pathname : baseUrl.pathname + '/';
    let path = url.pathname;
    try { path = decodeURIComponent(url.pathname); } catch { return null; }
    if (!path.startsWith(prefix) || path.includes('..')) return null;
  }
  return url.toString();
}

export function readmeImageOptions(repo: string, markdown: string, base: string): CoverOption[] {
  splitRepo(repo);
  let baseUrl: URL;
  try { baseUrl = assertCoverUrl(base); } catch { return []; }
  if (baseUrl.hostname !== 'raw.githubusercontent.com' || !baseUrl.pathname.endsWith('/')) return [];
  const text = markdown.slice(0, 100_000);
  const found: {label: string; url: string}[] = [];
  const seen = new Set<string>();
  const push = (label: string, raw: string) => {
    const url = resolveReadmeUrl(baseUrl.toString(), raw);
    if (!url || seen.has(url)) return;
    seen.add(url);
    const clean = label.replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
    found.push({label: clean || 'Imagen del README', url});
  };
  for (const match of text.matchAll(/!\[([^\]]*)\]\(\s*<?([^\s)>]+)>?/g)) push(match[1] ?? '', match[2] ?? '');
  for (const match of text.matchAll(/<img\b[^>]*>/gi)) {
    const tag = match[0];
    const src = /\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i.exec(tag);
    const alt = /\balt\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag);
    push(alt?.[1] ?? alt?.[2] ?? '', src?.[1] ?? src?.[2] ?? src?.[3] ?? '');
  }
  return found.slice(0, 3).map((image, index) => ({id: `github:readme:${index}`, source: 'github' as const, label: `${image.label} · README`, previewUrl: image.url}));
}

function dedupe(options: CoverOption[]) {
  const seen = new Set<string>();
  const result: CoverOption[] = [];
  for (const option of options) {
    try {
      const previewUrl = assertCoverUrl(option.previewUrl).toString();
      if (seen.has(previewUrl) || seen.has(option.id)) continue;
      seen.add(previewUrl);
      seen.add(option.id);
      result.push({...option, previewUrl});
    } catch { /* Drop any candidate that escaped the source allowlist. */ }
  }
  return result.slice(0, SOURCE_LIMIT);
}

async function settle<T>(work: Promise<T>, fallback: T) {
  try { return await work; } catch { return fallback; }
}

export async function searchCoverOptions(deps: CoverSearchDeps) {
  const title = deps.title.replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (!title) throw new Error('Juego inválido.');
  const request = deps.fetch ?? fetch;
  const [spanish, english, commons, steam, readme] = await Promise.all([
    settle(fetchCoverJson(wikiApi('es', title), request).then(payload => wikiOptions('es', payload, 2)), [] as CoverOption[]),
    settle(fetchCoverJson(wikiApi('en', title), request).then(payload => wikiOptions('en', payload, 1)), [] as CoverOption[]),
    settle(fetchCoverJson(commonsApi(title), request).then(commonsOptions), [] as CoverOption[]),
    settle(fetchCoverJson(steamApi(title), request).then(steamOptions), [] as CoverOption[]),
    settle(Promise.resolve().then(() => deps.readme?.() ?? null).then(document => document ? readmeImageOptions(deps.repo, document.markdown, document.base) : []), [] as CoverOption[]),
  ]);
  return dedupe([githubSocialOption(deps.repo), ...readme, ...spanish, ...steam, ...english, ...commons]);
}

export async function findCoverOption(deps: CoverSearchDeps, optionId: string) {
  if (!optionId || optionId.length > 400 || /[\u0000-\u001f\s]/.test(optionId)) throw new Error('Opción de portada inválida.');
  const found = (await searchCoverOptions(deps)).find(option => option.id === optionId);
  if (!found) throw new Error('Esa portada no está entre las opciones de este juego.');
  return {...found, previewUrl: assertCoverUrl(found.previewUrl).toString()};
}
