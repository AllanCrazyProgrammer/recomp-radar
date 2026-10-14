// Cover fetches never accept a caller-supplied host. API lookups and image
// bytes each have their own exact hostname allowlist, and redirects are checked hop by hop.
const IMAGE_HOSTS = new Set([
  'upload.wikimedia.org',
  'opengraph.githubassets.com',
  'repository-images.githubusercontent.com',
  'raw.githubusercontent.com',
  'user-images.githubusercontent.com',
  'private-user-images.githubusercontent.com',
  'objects.githubusercontent.com',
  'media.githubusercontent.com',
  'camo.githubusercontent.com',
  'cdn.akamai.steamstatic.com',
  'shared.akamai.steamstatic.com',
  'cdn.cloudflare.steamstatic.com',
  'shared.steamstatic.com',
  'steamcdn-a.akamaihd.net',
]);
const API_HOSTS = new Set([
  'es.wikipedia.org',
  'en.wikipedia.org',
  'commons.wikimedia.org',
  'store.steampowered.com',
]);
const USER_AGENT = 'RecompRadar/1.0 (personal library cover search)';
export const MAX_SOURCE_BYTES = 8 * 1024 * 1024;

export type CoverFetch = (input: string, init?: RequestInit) => Promise<Response>;

function isIpHost(hostname: string) {
  return hostname.includes(':') || /^\d+$/.test(hostname) || /^0x[0-9a-f.]+$/i.test(hostname) || /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
}

function parseHttps(input: string, hosts: Set<string>, kind: 'image' | 'api') {
  let url: URL;
  try { url = new URL(input); } catch { throw new Error('La dirección de la imagen no es válida.'); }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) throw new Error('La dirección de la imagen no es válida.');
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!hostname || isIpHost(hostname) || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal')) throw new Error('La imagen no procede de una fuente permitida.');
  if (kind === 'image' && hostname === 'github.com') {
    if (!url.pathname.startsWith('/user-attachments/')) throw new Error('La imagen no procede de una fuente permitida.');
  } else if (!hosts.has(hostname)) throw new Error('La imagen no procede de una fuente permitida.');
  url.hash = '';
  return url;
}

export function assertCoverUrl(input: string) {
  return parseHttps(input, IMAGE_HOSTS, 'image');
}

export function assertCoverApiUrl(input: string) {
  return parseHttps(input, API_HOSTS, 'api');
}

function ownMessage(error: unknown) {
  return error instanceof Error && /^(La |El |No |Usa |Esa |Opción )/.test(error.message) ? error : null;
}

async function readLimited(response: Response, max: number) {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > max) throw new Error('La imagen de origen es demasiado grande para convertirla.');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('La imagen no está disponible.');
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const {done, value} = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      throw new Error('La imagen de origen es demasiado grande para convertirla.');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.byteLength; }
  return bytes;
}

async function fetchChecked(start: string, hosts: Set<string>, kind: 'image' | 'api', accept: string, max: number, request: CoverFetch) {
  let current = parseHttps(start, hosts, kind).toString();
  for (let hop = 0; hop <= 3; hop++) {
    let response: Response;
    try {
      response = await request(current, {redirect: 'manual', headers: {Accept: accept, 'User-Agent': USER_AGENT}, signal: AbortSignal.timeout(10000)});
    } catch (error) {
      throw ownMessage(error) ?? new Error(kind === 'api' ? 'No se pudo consultar la fuente de portadas.' : 'No se pudo descargar la portada.');
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      await response.body?.cancel().catch(() => undefined);
      if (!location || hop === 3) throw new Error(kind === 'api' ? 'No se pudo consultar la fuente de portadas.' : 'No se pudo descargar la portada.');
      current = parseHttps(new URL(location, current).toString(), hosts, kind).toString();
      continue;
    }
    if (!response.ok) throw new Error(kind === 'api' ? 'No se pudo consultar la fuente de portadas.' : 'La imagen no está disponible.');
    if (kind === 'image') {
      const type = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() ?? '';
      if (type === 'image/svg+xml' || type === 'image/gif' || type === 'image/webp' || type.startsWith('text/') || type === 'application/json') {
        await response.body?.cancel().catch(() => undefined);
        throw new Error('Usa una imagen JPG o PNG válida. No se admiten SVG ni otros formatos.');
      }
    }
    try { return await readLimited(response, max); }
    catch (error) { throw ownMessage(error) ?? new Error(kind === 'api' ? 'No se pudo consultar la fuente de portadas.' : 'No se pudo descargar la portada.'); }
  }
  throw new Error(kind === 'api' ? 'No se pudo consultar la fuente de portadas.' : 'No se pudo descargar la portada.');
}

export function fetchCoverJson(url: string, request: CoverFetch = fetch) {
  return fetchChecked(url, API_HOSTS, 'api', 'application/json', 1024 * 1024, request).then(bytes => {
    try { return JSON.parse(new TextDecoder().decode(bytes)) as unknown; }
    catch { throw new Error('No se pudo consultar la fuente de portadas.'); }
  });
}

export async function fetchCoverBytes(url: string, request: CoverFetch = fetch) {
  assertCoverUrl(url);
  const bytes = await fetchChecked(url, IMAGE_HOSTS, 'image', 'image/jpeg,image/png,image/*;q=0.5', MAX_SOURCE_BYTES, request);
  return bytes;
}
