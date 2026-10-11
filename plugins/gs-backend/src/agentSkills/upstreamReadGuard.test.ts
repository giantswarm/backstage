import { GitHubApiError } from './discoverAgentSkills';
import { GitFetchError } from './discoverAgentSkillsFromGit';
import {
  isDefiniteMiss,
  MISS_TTL_MS,
  UpstreamReadGuard,
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
});
