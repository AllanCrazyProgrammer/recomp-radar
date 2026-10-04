import type {RadarEvent, Target} from './domain';

export type Installation = {
  repo: string;
  releaseId: string | null;
  tag: string;
  title: string;
  publishedAt: string | null;
  prerelease: boolean | null;
  markedAt: string;
};
type Semver = {core: bigint[]; pre: string[]};

function semver(tag: string): Semver | null {
  const match = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*))?(?:\+[\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*)?$/.exec(tag);
  if (!match) return null;
  const pre = match[4]?.split('.') ?? [];
  if (pre.some(part => /^\d+$/.test(part) && part.length > 1 && part.startsWith('0'))) return null;
  return {core: match.slice(1, 4).map(BigInt), pre};
}

export function compareVersions(a: string, b: string): number | null {
  const left = semver(a), right = semver(b);
  if (!left || !right) return null;
  for (let i = 0; i < 3; i++) {
    if (left.core[i] !== right.core[i]) return left.core[i] > right.core[i] ? 1 : -1;
  }
  if (!left.pre.length || !right.pre.length) return left.pre.length === right.pre.length ? 0 : left.pre.length ? -1 : 1;
  for (let i = 0; i < Math.max(left.pre.length, right.pre.length); i++) {
    const x = left.pre[i], y = right.pre[i];
    if (x === undefined || y === undefined) return x === undefined ? -1 : 1;
    if (x === y) continue;
    const xn = /^\d+$/.test(x), yn = /^\d+$/.test(y);
    if (xn && yn) return BigInt(x) > BigInt(y) ? 1 : -1;
    if (xn !== yn) return xn ? -1 : 1;
    return x > y ? 1 : -1;
  }
  return 0;
}

export function releaseTag(event: RadarEvent): string | null {
  if (event.kind !== 'release') return null;
  if (event.releaseTag) return event.releaseTag;
  try {
    const url = new URL(event.url);
    const marker = '/releases/tag/';
    const at = url.pathname.indexOf(marker);
    return url.hostname === 'github.com' && at >= 0 ? decodeURIComponent(url.pathname.slice(at + marker.length)) || null : null;
  } catch {return null;}
}

export function installationFromRelease(event: RadarEvent, markedAt: string): Installation {
  if (event.kind !== 'release' || !['published', 'prerelease'].includes(event.status)) throw new Error('Selecciona una release publicada, no un commit o una PR.');
  const tag = releaseTag(event);
  if (!tag) throw new Error('Esta release no incluye una etiqueta identificable. Puedes escribir la versión manualmente.');
  return {repo: event.repo.toLowerCase(), releaseId: event.id, tag, title: event.title, publishedAt: validTime(event.date) === null ? null : event.date, prerelease: event.status === 'prerelease', markedAt};
}

export function manualInstallation(repo: string, input: string, markedAt: string): Installation {
  const tag = input.trim();
  if (!tag || tag.length > 120 || /[\u0000-\u001f\u007f]/.test(tag)) throw new Error('Escribe una etiqueta de versión válida de hasta 120 caracteres.');
  const parsed = semver(tag);
  return {repo: repo.toLowerCase(), releaseId: null, tag, title: tag, publishedAt: null, prerelease: parsed ? parsed.pre.length > 0 : null, markedAt};
}

function validTime(date: string | null | undefined): number | null {
  if (!date) return null;
  const time = Date.parse(date);
  return Number.isFinite(time) ? time : null;
}
export type UpdateNotice = {release: RadarEvent; basis: 'date' | 'semver'; explanation: string};

export function releaseOverview(events: RadarEvent[], installation: Installation | null) {
  const releases = [...new Map(events.filter(e => e.kind === 'release' && ['published', 'prerelease'].includes(e.status)).map(e => [e.id, e])).values()]
    .sort((a, b) => (validTime(b.date) ?? 0) - (validTime(a.date) ?? 0) || a.id.localeCompare(b.id));
  const stable = releases.filter(e => e.status !== 'prerelease');
  const latest = stable[0] ?? releases[0] ?? null;
  const latestPreliminary = releases.find(e => e.status === 'prerelease') ?? null;
  let update: UpdateNotice | null = null;
  let comparisonNote = 'Marca la versión que instalaste para comparar futuras releases.';
  if (installation) {
    const matched = releases.find(e => e.id === installation.releaseId || releaseTag(e) === installation.tag);
    const installedDate = validTime(matched?.date ?? installation.publishedAt);
    const installedTag = matched ? releaseTag(matched) ?? installation.tag : installation.tag;
    const allowPreliminary = matched ? matched.status === 'prerelease' : installation.prerelease === true;
    const eligible = releases.filter(e => e.repo.toLowerCase() === installation.repo.toLowerCase() && (allowPreliminary || e.status !== 'prerelease'));
    for (const release of eligible) {
      const tag = releaseTag(release);
      if (release.id === installation.releaseId || tag === installedTag) continue;
      const published = validTime(release.date);
      if (published === null) continue;
      const comparison = tag ? compareVersions(tag, installedTag) : null;
      // A later backport of a lower semver is not an upgrade. Publication date is
      // the only ordering evidence for arbitrary tags; detection/edit dates are ignored.
      if (comparison !== null && comparison <= 0) continue;
      if (installedDate !== null && published <= installedDate) continue;
      if (installedDate === null && comparison !== 1) continue;
      const basis = installedDate !== null ? 'date' as const : 'semver' as const;
      update = {release, basis, explanation: basis === 'date'
        ? comparison === null ? 'Esta release se publicó después de la versión marcada. Sus etiquetas no permiten comparar números de versión.' : 'Esta release se publicó después y su versión es superior a la que marcaste.'
        : 'La etiqueta semver es superior a la que escribiste. No conocemos la fecha de publicación de tu versión instalada.'};
      break;
    }
    comparisonNote = update?.explanation ?? (!releases.length ? 'Todavía no hay releases capturadas para comparar.'
      : installedDate === null && !semver(installedTag) ? 'No podemos ordenar esta etiqueta sin una release y fecha conocidas. No se muestra un aviso de actualización.'
      : `No se ha capturado una release posterior compatible con esta comparación.${allowPreliminary ? ' También se consideran preliminares.' : ' Las preliminares se muestran aparte.'}`);
  }
  return {releases, latest, latestPreliminary, update, comparisonNote};
}

export type LibraryGame = {
  repo: string; title: string; project: string; nectar: boolean; priority: number;
  events: RadarEvent[]; installation: Installation | null; overview: ReturnType<typeof releaseOverview>;
  unread: number; error: string | null;
};
export function buildLibrary(targets: Target[], events: RadarEvent[], releases: RadarEvent[], installations: Installation[]): LibraryGame[] {
  const repos = [...new Map(targets.flatMap(t => t.repos).map(repo => [repo.toLowerCase(), repo])).values()];
  return repos.map(repo => {
    const sources = targets.filter(t => t.repos.some(r => r.toLowerCase() === repo.toLowerCase()));
    const own = [...new Map([...events, ...releases].filter(e => e.repo.toLowerCase() === repo.toLowerCase()).map(e => [e.id, e])).values()];
    const nectar = repo.toLowerCase() === 'ssunnking/open-nectar---pikmin-native-pc-mobile-port';
    const explicit = sources.find(t => t.kind === 'repo');
    const title = nectar ? 'Pikmin' : explicit?.label ?? repo.split('/')[1].replace(/[_-]+/g, ' ');
    const project = nectar ? 'Project Nectar' : repo.split('/')[1];
    const installation = installations.find(i => i.repo.toLowerCase() === repo.toLowerCase()) ?? null;
    return {repo, title, project, nectar, priority: Math.max(0, ...sources.map(t => t.priority)), events: own, installation,
      overview: releaseOverview(own, installation), unread: own.filter(e => !e.read).length, error: sources.map(t => t.error).filter(Boolean).join(' ') || null};
  }).sort((a, b) => Number(!!b.overview.update) - Number(!!a.overview.update) || b.priority - a.priority || a.title.localeCompare(b.title, 'es'));
}

export function gameHref(repo: string, releaseId?: string) {
  return '#juego=' + encodeURIComponent(repo) + (releaseId ? '&release=' + encodeURIComponent(releaseId) : '');
}
