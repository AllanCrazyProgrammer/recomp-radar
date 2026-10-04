import {fingerprint, type RadarEvent} from './domain.ts';

export type GithubRepo = {full_name: string; private: boolean; archived: boolean; fork: boolean};
export type GithubOrg = {login: string};
export type GithubEvent = {
  id?: number; sha?: string; name?: string; title?: string; tag_name?: string;
  body?: string | null; html_url: string; published_at?: string | null;
  created_at?: string; updated_at?: string; merged_at?: string | null;
  prerelease?: boolean; draft?: boolean; state?: string;
  commit?: {message?: string; committer?: {date?: string}; author?: {date?: string}};
  assets?: {id: number; name: string; size: number; updated_at: string}[];
};
export type GithubFetch = <T>(path: string, fresh?: boolean) => Promise<T>;
export const eventEndpoints = {
  release: '/releases?per_page=20',
  commit: '/commits?per_page=30',
  pr: '/pulls?state=all&sort=updated&direction=desc&per_page=30',
} as const;

export async function normalize(repo: string, kind: RadarEvent['kind'], raw: GithubEvent): Promise<RadarEvent> {
  const title = kind === 'commit' ? String(raw.commit?.message ?? 'Commit').split('\n')[0] : String(raw.name || raw.title || raw.tag_name || 'Sin título');
  const body = String(kind === 'commit' ? raw.commit?.message ?? '' : raw.body ?? '').slice(0, 6000);
  const status = kind === 'release' ? (raw.prerelease ? 'prerelease' : 'published') : kind === 'pr' ? (raw.merged_at ? 'merged' : raw.draft ? 'draft' : raw.state ?? 'open') : 'code';
  const assets = kind === 'release' ? (raw.assets ?? []).length : 0;
  const revision = await fingerprint({title, body, status, assets: kind === 'release' ? (raw.assets ?? []).map(a => [a.id, a.name, a.size, a.updated_at]) : null});
  return {id: `${repo}:${kind}:${raw.id ?? raw.sha}`, repo, kind, title, body, url: raw.html_url,
    date: kind === 'release' ? raw.published_at ?? '' : kind === 'commit' ? raw.commit?.committer?.date ?? raw.commit?.author?.date ?? '' : raw.created_at ?? '',
    sourceUpdated: raw.updated_at ?? null, revision, status, assets,
    releaseTag: kind === 'release' ? raw.tag_name || null : null, firstSeen: '', detectedAt: '', read: false};
}
