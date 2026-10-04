import {MAX_REPOS, type RadarEvent, type Target} from './domain.ts';
import {GithubRateLimitError} from './github-rate.ts';
import {eventEndpoints, normalize, type GithubEvent, type GithubFetch, type GithubRepo} from './github-data.ts';

export type RefreshResult = {busy: boolean; added: number; changed: number; errors: string[]; repos: string[]; at?: string; retryAfterMs?: number; rateLimited?: boolean; retryAt?: number};
export type SyncOptions = {fresh?: boolean; targetId?: string};
type Dependencies = {db: D1Database; github: GithubFetch; listTargets: () => Promise<Target[]>; now?: () => number};
const LEASE_MS = 45_000;
class LeaseLost extends Error {constructor() {super('La consulta cambió de proceso. Vuelve a intentarlo.');}}

// Old numeric leases are respected during deployment as well as the new owned leases.
const expires = "CASE WHEN json_valid(value) AND json_type(value)='object' THEN json_extract(value,'$.expiresAt') ELSE CAST(value AS INTEGER) END";
async function acquireLease(db: D1Database, now: () => number) {
  const owner = crypto.randomUUID();
  let value = JSON.stringify({owner, expiresAt: now() + LEASE_MS});
  const acquired = await db.prepare(`INSERT INTO settings(key,value) VALUES('refresh-lock',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE ${expires}<=? RETURNING value`).bind(value, now()).first();
  if (!acquired) return null;
  return {
    async renew() {
      const next = JSON.stringify({owner, expiresAt: now() + LEASE_MS});
      const renewed = await db.prepare(`UPDATE settings SET value=? WHERE key='refresh-lock' AND value=? AND ${expires}>? RETURNING value`).bind(next, value, now()).first();
      if (!renewed) throw new LeaseLost();
      value = next;
    },
    async release() {await db.prepare("DELETE FROM settings WHERE key='refresh-lock' AND value=?").bind(value).run();},
  };
}

type StoredEvent = {id: string; revision: string; first_seen: string; detected_at: string; date: string; source_updated: string | null; url: string; release_tag: string | null};
export async function persistEvents(db: D1Database, incoming: RadarEvent[], timestamp: string) {
  if (!incoming.length) return {added: 0, changed: 0};
  const rows = await db.prepare(`SELECT id,revision,first_seen,detected_at,date,source_updated,url,release_tag FROM events WHERE id IN (${incoming.map(() => '?').join(',')})`).bind(...incoming.map(e => e.id)).all<StoredEvent>();
  const prior = new Map(rows.results.map(e => [e.id, e]));
  let added = 0, changed = 0;
  const writes: D1PreparedStatement[] = [];
  for (const event of incoming) {
    const old = prior.get(event.id);
    const edited = !!old && old.revision !== event.revision;
    // Metadata can change without resetting the user's read state.
    if (old && !edited && old.date === event.date && old.source_updated === event.sourceUpdated && old.url === event.url && old.release_tag === (event.releaseTag ?? null)) continue;
    if (!old) added++;
    else if (edited) changed++;
    writes.push(db.prepare(`INSERT INTO events(id,repo,kind,title,body,url,date,source_updated,revision,status,assets,first_seen,detected_at,release_tag)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
      title=excluded.title,body=excluded.body,url=excluded.url,date=excluded.date,source_updated=excluded.source_updated,
      revision=excluded.revision,status=excluded.status,assets=excluded.assets,detected_at=excluded.detected_at,release_tag=excluded.release_tag`)
      .bind(event.id,event.repo,event.kind,event.title,event.body,event.url,event.date,event.sourceUpdated,event.revision,event.status,event.assets,
        old?.first_seen ?? timestamp, old && !edited ? old.detected_at : timestamp, event.releaseTag ?? null));
  }
  // Each endpoint is at most 30 events; D1 executes the writes as one transaction.
  if (writes.length) await db.batch(writes);
  return {added, changed};
}

export function selectRepos(targets: Target[], attempts: Map<string, number>, targetId?: string) {
  const preferred = targetId ? targets.find(t => t.id === targetId) : undefined;
  if (targetId && !preferred) throw new Error('Esta fuente ya no pertenece a tu biblioteca.');
  const ordered = [...(preferred ? [preferred] : targets)].sort((a,b) => Number(a.kind === 'org') - Number(b.kind === 'org') || b.priority - a.priority || a.createdAt.localeCompare(b.createdAt));
  const repos = [...new Set(ordered.flatMap(t => t.repos))];
  // Oldest attempt first prevents starvation, even when a repository keeps failing.
  return repos.sort((a,b) => (attempts.get(a) ?? 0) - (attempts.get(b) ?? 0)).slice(0,MAX_REPOS);
}

export async function syncTargets({db, github, listTargets, now = Date.now}: Dependencies, options: SyncOptions = {}): Promise<RefreshResult> {
  const lease = await acquireLease(db, now);
  if (!lease) return {busy:true, added:0, changed:0, errors:[], repos:[], retryAfterMs:3000};
  const errors: string[] = [], checked: string[] = [];
  let added = 0, changed = 0, retryAt: number | undefined;
  try {
    const targets = await listTargets();
    if (options.targetId && !targets.some(t => t.id === options.targetId)) throw new Error('Esta fuente ya no pertenece a tu biblioteca.');
    const scoped = options.targetId ? targets.filter(t => t.id === options.targetId) : targets;
    for (const target of scoped.filter(t => t.kind === 'org')) {
      await lease.renew();
      try {
        const rows = await github<GithubRepo[]>(`/orgs/${target.key}/repos?per_page=100&sort=pushed&direction=desc&type=public`,options.fresh);
        await lease.renew();
        const repos = rows.filter(r => !r.archived && !r.fork).slice(0,MAX_REPOS).map(r => r.full_name);
        if (JSON.stringify(repos) !== JSON.stringify(target.repos)) {
          await db.prepare('UPDATE targets SET repos=? WHERE id=?').bind(JSON.stringify(repos),target.id).run();
          target.repos = repos;
        }
      } catch (error) {
        if (error instanceof LeaseLost) throw error;
        if (error instanceof GithubRateLimitError) retryAt = Math.max(retryAt ?? 0,error.retryAt);
        else errors.push(`${target.key}: ${error instanceof Error ? error.message : 'Error de organización'}`);
      }
    }
    const allRepos = [...new Set(scoped.flatMap(t => t.repos))];
    const attempts = new Map<string,number>();
    // Limit SQL parameters even for a background cycle across several users.
    for (let i = 0; i < allRepos.length; i += 80) {
      const group = allRepos.slice(i,i+80);
      const rows = await db.prepare(`SELECT key,value FROM settings WHERE key IN (${group.map(() => '?').join(',')})`).bind(...group.map(repo => 'repo-sync:'+repo)).all<{key:string;value:string}>();
      for (const row of rows.results) attempts.set(row.key.slice('repo-sync:'.length),Number(row.value));
    }
    const repos = selectRepos(scoped,attempts,options.targetId);
    if (allRepos.length > MAX_REPOS) errors.push(`Se consultan ${MAX_REPOS} repositorios por ciclo. Los restantes rotan automáticamente en próximas consultas.`);
    const incomplete = new Set<string>(), attempted = new Set<string>();
    async function saveRows(repo:string,kind:RadarEvent['kind'],rows:GithubEvent[]) {
      const incoming = await Promise.all(rows.filter(row => !(kind === 'release' && row.draft)).map(row => normalize(repo,kind,row)));
      await lease!.renew();
      const saved = await persistEvents(db,incoming,new Date(now()).toISOString());
      added += saved.added;
      changed += saved.changed;
    }
    // Spend scarce requests on releases for all selected games before development activity.
    for (const kind of ['release','commit','pr'] as const) {
      for (const repo of repos) {
        await lease.renew();
        try {
          const rows = await github<GithubEvent[]>(`/repos/${repo}${eventEndpoints[kind]}`,options.fresh);
          attempted.add(repo);
          await saveRows(repo,kind,rows);
        } catch (error) {
          if (error instanceof LeaseLost) throw error;
          incomplete.add(repo);
          if (error instanceof GithubRateLimitError) {
            retryAt = Math.max(retryAt ?? 0,error.retryAt);
            // A previous partial cycle may have cached releases without saving events.
            if (Array.isArray(error.cachedData)) await saveRows(repo,kind,error.cachedData as GithubEvent[]);
          } else {
            attempted.add(repo);
            errors.push(`${repo}: ${kind === 'release' ? 'releases' : kind === 'commit' ? 'commits' : 'PR'}: ${error instanceof Error ? error.message : 'No se pudo actualizar'}`);
          }
        }
      }
    }
    checked.push(...repos.filter(repo => !incomplete.has(repo)));
    await lease.renew();
    const attemptsToSave = [...attempted].map(repo => db.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind('repo-sync:'+repo,String(now())));
    if (attemptsToSave.length) await db.batch(attemptsToSave);
    await lease.renew();
    const targetWrites = scoped.map(target => {
      const ownErrors = errors.filter(error => error.startsWith(target.key+':') || target.repos.some(repo => error.startsWith(repo+':')));
      const coverage = target.repos.filter(repo => !checked.includes(repo));
      if (coverage.length) ownErrors.push(retryAt ? 'Consulta pendiente por la pausa de GitHub.' : `${coverage.length} repositorios pendientes de comprobar; se retomarán en próximas consultas.`);
      return db.prepare('UPDATE targets SET last_sync=?,error=? WHERE id=?').bind(!coverage.length && !ownErrors.length ? new Date(now()).toISOString() : target.lastSync,ownErrors.join(' ') || null,target.id);
    });
    if (targetWrites.length) await db.batch(targetWrites);
    const result:RefreshResult = {busy:false,added,changed,errors,repos:checked,at:new Date(now()).toISOString(),...(retryAt ? {rateLimited:true,retryAt} : {})};
    await db.prepare("INSERT INTO settings(key,value) VALUES('last-sync',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(JSON.stringify(result)).run();
    return result;
  } finally {await lease.release();}
}
