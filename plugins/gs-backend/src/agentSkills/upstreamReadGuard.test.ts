import { GitHubApiError } from './discoverAgentSkills';
import { GitFetchError } from './discoverAgentSkillsFromGit';
import {
  isDefiniteMiss,
  MAX_MISS_ENTRIES,
  MISS_TTL_MS,
  READ_DEADLINE_MS,
  UpstreamBusyError,
  UpstreamReadGuard,
  UpstreamTimeoutError,
} from './upstreamReadGuard';

/** A promise to settle by hand, and the task that waits on it. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const flush = () => new Promise(resolve => setImmediate(resolve));

describe('isDefiniteMiss', () => {
  it.each([
    [new GitHubApiError(404, 'Not Found'), true],
    [new GitHubApiError(422, 'No commit found'), true],
    [new GitHubApiError(403, 'limit', {}), false],
    [new GitHubApiError(429, 'limit'), false],
    [new GitHubApiError(502, 'Bad Gateway'), false],
    [new GitFetchError(404, 'no ref'), true],
    [new GitFetchError(409, 'moved on'), true],
    [new GitFetchError(502, 'unreachable'), false],
    [new UpstreamTimeoutError(30_000), false],
    [new UpstreamBusyError(), false],
    [new Error('reset'), false],
  ])('%p → %p', (error, expected) => {
    expect(isDefiniteMiss(error)).toBe(expected);
  });
});

describe('UpstreamReadGuard', () => {
  let now: number;
  let guard: UpstreamReadGuard;

  beforeEach(() => {
    now = Date.UTC(2026, 9, 11, 12, 0);
    guard = new UpstreamReadGuard({ now: () => now });
  });

  it('answers a definite miss from memory for the TTL, then asks again', async () => {
    const task = jest.fn(async () => {
      throw new GitFetchError(409, 'moved on');
    });

    await expect(guard.read('clone', 'repo#c1', task)).rejects.toThrow(
      'moved on',
    );
    await expect(guard.read('clone', 'repo#c1', task)).rejects.toThrow(
      'moved on',
    );
    expect(task).toHaveBeenCalledTimes(1);

    now += MISS_TTL_MS;
    await expect(guard.read('clone', 'repo#c1', task)).rejects.toThrow(
      'moved on',
    );
    expect(task).toHaveBeenCalledTimes(2);
  });

  it('remembers a miss per key and per pool only', async () => {
    const missing = jest.fn(async () => {
      throw new GitHubApiError(404, 'Not Found');
    });
    await guard.read('github', 'repo#c1', missing).catch(() => undefined);

    const found = jest.fn(async () => 'ok');
    await expect(guard.read('github', 'repo#c2', found)).resolves.toBe('ok');
    await expect(guard.read('clone', 'repo#c1', found)).resolves.toBe('ok');
  });

  it('does not remember a transient failure', async () => {
    const task = jest
      .fn<Promise<string>, []>()
      .mockRejectedValueOnce(new GitHubApiError(429, 'limit'))
      .mockResolvedValueOnce('ok');

    await expect(guard.read('github', 'repo#c1', task)).rejects.toThrow(
      'limit',
    );
    await expect(guard.read('github', 'repo#c1', task)).resolves.toBe('ok');
  });

  it('shares one upstream read between concurrent reads of a key', async () => {
    const upstream = deferred<string>();
    const task = jest.fn(() => upstream.promise);

    const first = guard.read('clone', 'repo#c1', task);
    const second = guard.read('clone', 'repo#c1', task);
    upstream.resolve('snapshot');

    await expect(Promise.all([first, second])).resolves.toEqual([
      'snapshot',
      'snapshot',
    ]);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('runs at most the pool’s cap at once; the rest wait their turn', async () => {
    guard = new UpstreamReadGuard({ maxConcurrent: { clone: 2 } });
    const upstream = [0, 1, 2].map(() => deferred<string>());
    let running = 0;
    let peak = 0;
    const reads = upstream.map((d, i) =>
      guard.read('clone', `repo#c${i}`, async () => {
        running += 1;
        peak = Math.max(peak, running);
        try {
          return await d.promise;
        } finally {
          running -= 1;
        }
      }),
    );
    await flush();
    expect(running).toBe(2);

    upstream[0].resolve('a');
    await flush();
    expect(running).toBe(2);
    upstream[1].resolve('b');
    upstream[2].resolve('c');

    await expect(Promise.all(reads)).resolves.toEqual(['a', 'b', 'c']);
    expect(peak).toBe(2);
  });

  it('refuses with a 503 once the wait queue is full, without reading', async () => {
    guard = new UpstreamReadGuard({
      maxConcurrent: { github: 1 },
      maxQueued: 1,
    });
    const upstream = deferred<string>();
    const task = jest.fn(() => upstream.promise);

    const running = guard.read('github', 'repo#c1', task);
    const waiting = guard.read('github', 'repo#c2', task);
    const refused: unknown = await guard
      .read('github', 'repo#c3', task)
      .catch(e => e);

    // Its own class: the discovery cache must not take it for an outage.
    expect(refused).toBeInstanceOf(UpstreamBusyError);
    expect(refused).toBeInstanceOf(GitFetchError);
    expect(refused).toMatchObject({ status: 503 });
    upstream.resolve('ok');
    await expect(Promise.all([running, waiting])).resolves.toEqual([
      'ok',
      'ok',
    ]);
    expect(task).toHaveBeenCalledTimes(2);
  });

  it('caps a plain limited task too', async () => {
    guard = new UpstreamReadGuard({
      maxConcurrent: { github: 1 },
      maxQueued: 0,
    });
    const upstream = deferred<string>();

    const running = guard.limit('github', () => upstream.promise);
    await expect(
      guard.limit('github', async () => 'never'),
    ).rejects.toMatchObject({ status: 503 });
    upstream.resolve('ok');
    await expect(running).resolves.toBe('ok');
  });

  it('releases the slot of a failed read and hands it to the next waiting read', async () => {
    guard = new UpstreamReadGuard({ maxConcurrent: { clone: 1 } });
    const failing = deferred<string>();
    const next = jest.fn(async () => 'next');

    const first = guard.read('clone', 'repo#c1', () => failing.promise);
    const second = guard.read('clone', 'repo#c2', next);
    await flush();
    expect(next).not.toHaveBeenCalled();

    failing.reject(new GitFetchError(502, 'unreachable'));
    await expect(first).rejects.toMatchObject({ status: 502 });
    await expect(second).resolves.toBe('next');
    // The slot is free again, not leaked by the failure.
    await expect(guard.read('clone', 'repo#c3', next)).resolves.toBe('next');
  });

  it(`remembers at most ${MAX_MISS_ENTRIES} misses, dropping the oldest first`, async () => {
    const missing = jest.fn(async () => {
      throw new GitHubApiError(404, 'Not Found');
    });
    for (let i = 0; i <= MAX_MISS_ENTRIES; i++) {
      await guard.read('github', `repo#c${i}`, missing).catch(() => undefined);
    }
    expect(missing).toHaveBeenCalledTimes(MAX_MISS_ENTRIES + 1);

    // The newest and the second oldest are still answered from memory...
    await guard
      .read('github', `repo#c${MAX_MISS_ENTRIES}`, missing)
      .catch(() => undefined);
    await guard.read('github', 'repo#c1', missing).catch(() => undefined);
    expect(missing).toHaveBeenCalledTimes(MAX_MISS_ENTRIES + 1);
    // ...the oldest was dropped and is asked upstream again.
    await guard.read('github', 'repo#c0', missing).catch(() => undefined);
    expect(missing).toHaveBeenCalledTimes(MAX_MISS_ENTRIES + 2);
  });

  describe('deadline', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('gives up a read that never settles: 504 for every caller, the slot freed, the work aborted', async () => {
      guard = new UpstreamReadGuard({ maxConcurrent: { clone: 1 } });
      let signal: AbortSignal | undefined;
      const hung = jest.fn((s: AbortSignal) => {
        signal = s;
        return new Promise<string>(() => undefined);
      });
      const waiting = jest.fn(async () => 'next');

      const first = guard.read('clone', 'repo#c1', hung);
      const shared = guard.read('clone', 'repo#c1', hung);
      const queued = guard.read('clone', 'repo#c2', waiting);
      const outcomes = Promise.allSettled([first, shared]);

      await jest.advanceTimersByTimeAsync(READ_DEADLINE_MS.clone - 1);
      expect(signal?.aborted).toBe(false);
      expect(waiting).not.toHaveBeenCalled();

      await jest.advanceTimersByTimeAsync(1);
      const [a, b] = await outcomes;
      for (const outcome of [a, b]) {
        expect(outcome).toMatchObject({
          status: 'rejected',
          reason: expect.any(UpstreamTimeoutError),
        });
        expect((outcome as PromiseRejectedResult).reason.status).toBe(504);
      }
      expect(signal?.aborted).toBe(true);
      expect(signal?.reason).toBeInstanceOf(UpstreamTimeoutError);
      // The slot went to the waiting read.
      await expect(queued).resolves.toBe('next');
      expect(hung).toHaveBeenCalledTimes(1);

      // Transient: never remembered, so the next read asks upstream again.
      const retry = jest.fn(async () => 'ok');
      await expect(guard.read('clone', 'repo#c1', retry)).resolves.toBe('ok');
    });

    it('gives a plain limited task the pool’s own deadline too', async () => {
      const listing = guard.limit(
        'github',
        () => new Promise<string>(() => undefined),
      );
      const outcome = listing.catch(e => e);

      await jest.advanceTimersByTimeAsync(READ_DEADLINE_MS.github);
      expect(await outcome).toBeInstanceOf(UpstreamTimeoutError);
    });

    it('does not cut short a read that finishes in time', async () => {
      const read = guard.read(
        'github',
        'repo#c1',
        () =>
          new Promise<string>(resolve => {
            setTimeout(() => resolve('ok'), READ_DEADLINE_MS.github - 1);
          }),
      );

      await jest.advanceTimersByTimeAsync(READ_DEADLINE_MS.github);
      await expect(read).resolves.toBe('ok');
    });
  });
});
