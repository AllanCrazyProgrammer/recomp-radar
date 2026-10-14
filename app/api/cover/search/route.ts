import {getChatGPTUser} from '../../../chatgpt-auth';
import {followedRepo, listTargets} from '@/lib/radar';
import {github} from '@/lib/github';
import {splitRepo, coverSearchTitle, searchCoverOptions, findCoverOption, readmeImageBase} from '@/lib/cover-search';
import {fetchCoverBytes} from '@/lib/cover-allowlist';
import {prepareCover} from '@/lib/cover-normalize';
import {persistCover} from '@/lib/cover-store';

export const dynamic = 'force-dynamic';
const json = (value: unknown, status = 200) => Response.json(value, {status, headers: {'Cache-Control': 'private, no-store'}});

type ReadmeFile = {encoding?: string; content?: string; path?: string; download_url?: string; size?: number};

async function loadReadme(repo: string) {
  try {
    const [owner, name] = splitRepo(repo);
    const file = await github<ReadmeFile>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/readme`);
    if (file.encoding !== 'base64' || !file.content || !file.path || !file.download_url || (file.size ?? 0) > 200_000) return null;
    const base = readmeImageBase(repo, file.download_url, file.path);
    if (!base) return null;
    const binary = atob(file.content.replace(/\s/g, ''));
    if (binary.length > 200_000) return null;
    return {markdown: new TextDecoder().decode(Uint8Array.from(binary, char => char.charCodeAt(0))), base};
  } catch { return null; }
}

async function depsFor(userId: string, repoValue: unknown) {
  const repo = await followedRepo(userId, repoValue);
  const targets = await listTargets(userId);
  return {title: coverSearchTitle(repo, targets), repo, readme: () => loadReadme(repo)};
}

function denied(request: Request) {
  const origin = request.headers.get('origin');
  return origin && new URL(origin).host !== request.headers.get('host');
}

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return json({error: 'Inicia sesión para buscar una portada.'}, 401);
  try {
    const deps = await depsFor(user.userId, new URL(request.url).searchParams.get('repo'));
    const options = await searchCoverOptions(deps);
    return json({query: deps.title, options});
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo buscar una portada.';
    return json({error: message}, message.includes('no está disponible') ? 503 : 400);
  }
}

export async function POST(request: Request) {
  let ready = false;
  const user = await getChatGPTUser();
  if (!user) return json({error: 'Inicia sesión para guardar una portada.'}, 401);
  if (denied(request)) return json({error: 'Origen no permitido.'}, 403);
  if (!(request.headers.get('content-type') ?? '').includes('application/json')) return json({error: 'Solicitud de portada inválida.'}, 415);
  try {
    const text = await request.text();
    if (text.length > 4000) return json({error: 'Solicitud demasiado grande.'}, 413);
    const body = JSON.parse(text) as {repo?: unknown; option?: unknown};
    if (typeof body.option !== 'string') throw new Error('Opción de portada inválida.');
    const deps = await depsFor(user.userId, body.repo);
    const option = await findCoverOption(deps, body.option);
    const downloaded = await fetchCoverBytes(option.previewUrl);
    const prepared = prepareCover(downloaded);
    ready = true;
    const saved = await persistCover(user.userId, deps.repo.toLowerCase(), prepared.bytes, prepared.mime);
    return json({...saved, source: option.source});
  } catch (error) {
    if (error instanceof SyntaxError) return json({error: 'Solicitud de portada inválida.'}, 400);
    const message = error instanceof Error ? error.message : 'Solicitud de portada inválida.';
    return json({error: ready ? 'No se pudo guardar la portada. Intenta de nuevo.' : message}, ready ? 503 : message.includes('no está disponible') ? 503 : 400);
  }
}
