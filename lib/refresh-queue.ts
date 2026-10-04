import type {RefreshResult} from './sync.ts';

export type RefreshJob = {targetId?: string; fresh?: boolean; silent?: boolean};
type QueueOptions = {
  run: (job: RefreshJob, signal: AbortSignal) => Promise<RefreshResult>;
  status: (value: 'idle' | 'running' | 'waiting' | 'rate-limited') => void;
  error: (error: unknown) => void;
  schedule?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  now?: () => number;
  cancel?: (timer: ReturnType<typeof setTimeout>) => void;
};

// One request per tab. Newly added sources survive a collision with an older refresh.
export function createRefreshQueue(options: QueueOptions) {
  const pending = new Map<string,RefreshJob>();
  const controller = new AbortController();
  const schedule = options.schedule ?? setTimeout;
  const now = options.now ?? Date.now;
  const cancel = options.cancel ?? clearTimeout;
  let current: RefreshJob | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false, disposed = false, retries = 0;
  const key = (job: RefreshJob) => job.targetId ?? '*';

  function prioritizeTarget() {
    if (!current || current.targetId) return;
    const next = [...pending.entries()].find(([,job]) => !!job.targetId);
    if (!next) return;
    pending.set(key(current),current);
    pending.delete(next[0]);
    current = next[1];
  }

  async function drain() {
    timer = undefined;
    if (disposed || running) return;
    if (!current) {
      const next = pending.entries().next().value;
      if (!next) {options.status('idle'); return;}
      pending.delete(next[0]);
      current = next[1];
    }
    running = true;
    options.status('running');
    try {
      const result = await options.run(current,controller.signal);
      if (disposed) return;
      if (result.rateLimited && result.retryAt) {
        prioritizeTarget();
        options.status('rate-limited');
        // Do not cap a GitHub deadline to the short lock-contention retry interval.
        const delay=Math.max(1000,result.retryAt-now()+1000);
        timer=schedule(() => {void drain();},Math.min(delay,2_147_483_647));
        return;
      }
      if (result.busy) {
        prioritizeTarget();
        options.status('waiting');
        const delay = Math.min(10_000,Math.max(result.retryAfterMs ?? 3000,1000) * Math.pow(1.5,retries++));
        timer = schedule(() => {void drain();},delay);
        return;
      }
      current = undefined;
      retries = 0;
    } catch (error) {
      if (disposed) return;
      options.error(error);
      current = undefined;
      retries = 0;
    } finally {
      running = false;
      if (!disposed && timer === undefined) {
        if (pending.size) void drain();
        else options.status('idle');
      }
    }
  }
  return {
    request(job: RefreshJob = {}) {
      if (disposed) return;
      // Visibility changes do not create a second refresh while work is pending.
      if (!job.targetId && !job.fresh && (current || pending.size)) return;
      if (current && key(current) === key(job) && (!job.fresh || current.fresh)) return;
      const prior = pending.get(key(job));
      pending.set(key(job),{...job,fresh:job.fresh || prior?.fresh,silent:prior ? !!prior.silent && !!job.silent : job.silent});
      if (!running && timer !== undefined) prioritizeTarget();
      if (!running && timer === undefined) void drain();
    },
    dispose() {
      disposed = true;
      controller.abort();
      if (timer !== undefined) cancel(timer);
      pending.clear();
    },
  };
}
