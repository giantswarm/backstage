import { InputError } from '@backstage/errors';
import { GitHubApiError, SkillDiscoverySnapshot } from './discoverAgentSkills';
import { GitFetchError } from './discoverAgentSkillsFromGit';
import {
  DISCOVERY_TTL_MS,
  FAILURE_BACKOFF_MS,
  isTransientDiscoveryError,
  MAX_ENTRIES,
  MAX_KEPT_CONTENT_BYTES,
  MAX_PINNED_ENTRIES,
  MAX_STALE_MS,
  repositoryKey,
  SkillDiscoveryCache,
  UNREADABLE_RETRY_MS,
} from './skillDiscoveryCache';

const REPO = 'https://github.com/giantswarm/skills';
const HEAD = 'cb1fb768ba1d1b1e62c6e0b32c39a6b4bd3b58a1';
const NEXT = 'a'.repeat(40);

function snapshot(
  overrides: Partial<SkillDiscoverySnapshot> = {},
  readable = true,
): SkillDiscoverySnapshot {
  const commit = overrides.commit ?? HEAD;
  return {
    skills: [
      {
        name: 'notes',
        description: 'How to take notes.',
        repoUrl: REPO,
        path: 'notes',
        ref: 'main',
        commit,
        contentReadable: readable,
      },
    ],
    ref: 'main',
    commit,
    truncated: false,
    contents: readable
      ? new Map([['notes', '---\nname: notes\n---\nWrite it down.']])
      : new Map(),
    ...overrides,
  };
}

describe('SkillDiscoveryCache', () => {
  let now: number;
  let cache: SkillDiscoveryCache;

  beforeEach(() => {
    now = Date.UTC(2026, 9, 10, 12, 0);
    cache = new SkillDiscoveryCache({ now: () => now });
  });

  it('answers from memory while fresh, without the contents', async () => {
    const load = jest.fn(async () => snapshot());

    const first = await cache.discover(REPO, undefined, load);
    now += DISCOVERY_TTL_MS - 1;
    const second = await cache.discover(`${REPO}.git/`, undefined, load);

    expect(load).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
    expect(first.stale).toBe(false);
    expect(first.readAt).toBe(Date.UTC(2026, 9, 10, 12, 0));
    expect(first.result).not.toHaveProperty('contents');
    expect(first.result.skills[0].contentReadable).toBe(true);
  });

  it('keys by repository and ref', async () => {
    const load = jest.fn(async () => snapshot());

    await cache.discover(REPO, undefined, load);
    await cache.discover(REPO, 'v1', load);
    await cache.discover(
      'https://github.com/giantswarm/other',
      undefined,
      load,
    );

    expect(load).toHaveBeenCalledTimes(3);
  });

  it('revalidates after the TTL, handing the provider the previous snapshot', async () => {
    const load = jest.fn(async (_previous?: SkillDiscoverySnapshot) =>
      snapshot(),
    );
    await cache.discover(REPO, undefined, load);

    now += DISCOVERY_TTL_MS;
    await cache.discover(REPO, undefined, load);

    expect(load).toHaveBeenCalledTimes(2);
    expect(load.mock.calls[0][0]).toBeUndefined();
    expect(load.mock.calls[1][0]).toEqual(
      expect.objectContaining({ commit: HEAD }),
    );
  });

  it('revalidates a listing with an unreadable skill sooner', async () => {
    const load = jest.fn(async () => snapshot({}, false));
    await cache.discover(REPO, undefined, load);

    now += UNREADABLE_RETRY_MS;
    await cache.discover(REPO, undefined, load);

    expect(load).toHaveBeenCalledTimes(2);
  });

  it('shares one refresh between concurrent requests', async () => {
    let resolve!: (s: SkillDiscoverySnapshot) => void;
    const load = jest.fn(
      () =>
        new Promise<SkillDiscoverySnapshot>(r => {
          resolve = r;
        }),
    );

    const a = cache.discover(REPO, undefined, load);
    const b = cache.discover(REPO, undefined, load);
    resolve(snapshot());

    expect(await a).toEqual(await b);
    expect(load).toHaveBeenCalledTimes(1);
  });

  describe('when upstream fails', () => {
    const rateLimited = (retryAt?: number) =>
      new GitHubApiError(429, 'rate limit used up', { retryAt });

    it('serves the last listing, marked stale, on a rate limit', async () => {
      await cache.discover(REPO, undefined, async () => snapshot());
      now += DISCOVERY_TTL_MS;

      const answer = await cache.discover(REPO, undefined, async () => {
        throw rateLimited();
      });

      expect(answer.stale).toBe(true);
      expect(answer.result.commit).toBe(HEAD);
    });

    it.each([
      ['a network failure', new TypeError('fetch failed')],
      ['an unreachable git host', new GitFetchError(502, 'unreachable')],
      ['a GitHub outage', new GitHubApiError(503, 'unavailable')],
    ])('serves the last listing on %s', async (_, error) => {
      await cache.discover(REPO, undefined, async () => snapshot());
      now += DISCOVERY_TTL_MS;

      const answer = await cache.discover(REPO, undefined, async () => {
        throw error;
      });

      expect(answer.stale).toBe(true);
    });

    it("does not ask again before GitHub's retry time", async () => {
      await cache.discover(REPO, undefined, async () => snapshot());
      now += DISCOVERY_TTL_MS;
      const retryAt = now + 20 * 60 * 1000;
      await cache.discover(REPO, undefined, async () => {
        throw rateLimited(retryAt);
      });

      const load = jest.fn(async () => snapshot({ commit: NEXT }));
      now = retryAt - 1;
      expect((await cache.discover(REPO, undefined, load)).stale).toBe(true);
      expect(load).not.toHaveBeenCalled();

      now = retryAt;
      const fresh = await cache.discover(REPO, undefined, load);
      expect(load).toHaveBeenCalledTimes(1);
      expect(fresh).toEqual(
        expect.objectContaining({
          stale: false,
          result: expect.objectContaining({ commit: NEXT }),
        }),
      );
    });

    it('backs off for a minute when GitHub names no retry time', async () => {
      await cache.discover(REPO, undefined, async () => snapshot());
      now += DISCOVERY_TTL_MS;
      await cache.discover(REPO, undefined, async () => {
        throw rateLimited();
      });

      const load = jest.fn(async () => snapshot());
      now += FAILURE_BACKOFF_MS - 1;
      await cache.discover(REPO, undefined, load);
      expect(load).not.toHaveBeenCalled();
      now += 1;
      await cache.discover(REPO, undefined, load);
      expect(load).toHaveBeenCalledTimes(1);
    });

    it('forwards the failure when there is no listing to fall back on, and remembers it briefly', async () => {
      const error = rateLimited();
      const load = jest.fn(async () => {
        throw error;
      });

      await expect(cache.discover(REPO, undefined, load)).rejects.toBe(error);
      await expect(cache.discover(REPO, undefined, load)).rejects.toBe(error);
      expect(load).toHaveBeenCalledTimes(1);
    });

    it('does not paper over a definite answer (the repository is gone)', async () => {
      await cache.discover(REPO, undefined, async () => snapshot());
      now += DISCOVERY_TTL_MS;

      const gone = new GitHubApiError(404, 'Not Found');
      await expect(
        cache.discover(REPO, undefined, async () => {
          throw gone;
        }),
      ).rejects.toBe(gone);
      expect(cache.readContent(REPO, 'notes', HEAD)).toBeUndefined();
    });

    it('stops serving a listing older than a day', async () => {
      await cache.discover(REPO, undefined, async () => snapshot());
      now += MAX_STALE_MS + 1;

      const error = rateLimited();
      await expect(
        cache.discover(REPO, undefined, async () => {
          throw error;
        }),
      ).rejects.toBe(error);
    });
  });

  describe('readContent', () => {
    it('answers a SKILL.md the listing read at that commit', async () => {
      await cache.discover(REPO, undefined, async () => snapshot());

      expect(cache.readContent(`${REPO}.git`, 'notes', HEAD)).toEqual({
        raw: '---\nname: notes\n---\nWrite it down.',
        repoUrl: REPO,
      });
      expect(cache.readContent(REPO, 'notes', NEXT)).toBeUndefined();
      expect(cache.readContent(REPO, 'other', HEAD)).toBeUndefined();
    });

    it('answers nothing for an unreadable skill', async () => {
      await cache.discover(REPO, undefined, async () => snapshot({}, false));

      expect(cache.readContent(REPO, 'notes', HEAD)).toBeUndefined();
    });

    it('does not keep a file too large to hold in memory', async () => {
      const huge = 'x'.repeat(MAX_KEPT_CONTENT_BYTES + 1);
      const load = jest.fn(async (_previous?: SkillDiscoverySnapshot) =>
        snapshot({ contents: new Map([['notes', huge]]) }),
      );
      await cache.discover(REPO, undefined, load);

      expect(cache.readContent(REPO, 'notes', HEAD)).toBeUndefined();
      // Still readable: the listing read it, the content is read live.
      now += DISCOVERY_TTL_MS;
      const again = await cache.discover(REPO, undefined, load);
      expect(again.result.skills[0].contentReadable).toBe(true);
    });
  });

  describe('skill files', () => {
    const list = {
      files: [
        { path: 'SKILL.md', size: 30, sha: 's1' },
        { path: 'references/x.md', size: 4, sha: 's2' },
      ],
      truncated: false,
      total: 2,
    };

    it('answers a skill’s file list from the listing at that commit, never in the listing itself', async () => {
      const first = await cache.discover(REPO, undefined, async () =>
        snapshot({ files: new Map([['notes', list]]) }),
      );

      expect(cache.readSkillFiles(`${REPO}.git`, 'notes', HEAD)).toEqual(list);
      expect(cache.readSkillFiles(REPO, 'notes', NEXT)).toBeUndefined();
      expect(cache.readSkillFiles(REPO, 'other', HEAD)).toBeUndefined();
      expect(first.result).not.toHaveProperty('files');
      expect(first.result).not.toHaveProperty('fileContents');
    });

    it('moves the file bytes a checkout scan read into the file cache, out of the snapshot', async () => {
      let handedBack: SkillDiscoverySnapshot | undefined;
      const load = jest.fn(async (previous?: SkillDiscoverySnapshot) => {
        handedBack = previous;
        return snapshot({
          files: new Map([['notes', list]]),
          fileContents: new Map([
            ['notes/references/x.md', Buffer.from('text')],
          ]),
        });
      });
      await cache.discover(REPO, undefined, load);
      now += DISCOVERY_TTL_MS;
      await cache.discover(REPO, undefined, load);

      expect(cache.readFile(REPO, HEAD, 'notes/references/x.md')).toEqual({
        binary: false,
        bytes: Buffer.from('text'),
      });
      expect(cache.readFile(REPO, NEXT, 'notes/references/x.md')).toBe(
        undefined,
      );
      // The snapshot a revalidation is handed keeps the lists, not the bytes.
      expect(handedBack?.files).toEqual(new Map([['notes', list]]));
      expect(handedBack).not.toHaveProperty('fileContents');
    });

    it('remembers a file read on a view', () => {
      expect(
        cache.rememberFile(REPO, HEAD, 'notes/a.md', Buffer.from('a')),
      ).toEqual({ binary: false, bytes: Buffer.from('a') });
      expect(cache.readFile(`${REPO}/`, HEAD, 'notes/a.md')).toBeDefined();
    });

    it('remembers what a read outside a listing found at a commit', () => {
      cache.rememberPinned(REPO, NEXT, {
        files: new Map([['notes', list]]),
        contents: new Map([['notes', '---\nname: notes\n---\nOld.']]),
        fileContents: new Map([['notes/references/x.md', Buffer.from('x')]]),
      });

      expect(cache.readSkillFiles(REPO, 'notes', NEXT)).toEqual(list);
      expect(cache.readContent(REPO, 'notes', NEXT)).toEqual({
        raw: '---\nname: notes\n---\nOld.',
        repoUrl: REPO,
      });
      expect(cache.readFile(REPO, NEXT, 'notes/references/x.md')).toEqual({
        binary: false,
        bytes: Buffer.from('x'),
      });
    });

    it(`remembers at most ${MAX_PINNED_ENTRIES} commits read outside a listing`, () => {
      for (let i = 0; i <= MAX_PINNED_ENTRIES; i++) {
        cache.rememberPinned(REPO, String(i).padStart(40, '0'), {
          files: new Map([['notes', list]]),
        });
      }

      expect(
        cache.readSkillFiles(REPO, 'notes', '0'.repeat(40)),
      ).toBeUndefined();
      expect(
        cache.readSkillFiles(
          REPO,
          'notes',
          String(MAX_PINNED_ENTRIES).padStart(40, '0'),
        ),
      ).toEqual(list);
    });
  });

  it(`remembers at most ${MAX_ENTRIES} repositories, the longest unrefreshed leaving first`, async () => {
    const load = jest.fn(async () => snapshot());
    for (let i = 0; i <= MAX_ENTRIES; i++) {
      await cache.discover(`https://github.com/o/r${i}`, undefined, load);
    }
    load.mockClear();

    await cache.discover('https://github.com/o/r1', undefined, load);
    expect(load).not.toHaveBeenCalled();
    await cache.discover('https://github.com/o/r0', undefined, load);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('keeps the default-branch listing when callers flood it with refs', async () => {
    const load = jest.fn(async () => snapshot());
    await cache.discover(REPO, undefined, load);
    const missing = jest.fn(async () => {
      throw new GitHubApiError(404, 'Not Found');
    });
    for (let i = 0; i < MAX_ENTRIES; i++) {
      await cache.discover(REPO, `bad-${i}`, missing).catch(() => undefined);
    }
    for (let i = 0; i < MAX_ENTRIES; i++) {
      await cache.discover(REPO, `ref-${i}`, load);
    }
    load.mockClear();

    await cache.discover(REPO, undefined, load);

    expect(load).not.toHaveBeenCalled();
  });
});

describe('repositoryKey', () => {
  it('folds the ways one repository is written', () => {
    expect(repositoryKey(' https://github.com/GiantSwarm/Skills.git/ ')).toBe(
      'https://github.com/giantswarm/skills',
    );
  });
});

describe('isTransientDiscoveryError', () => {
  it.each([
    [new GitHubApiError(429, 'limit'), true],
    [new GitHubApiError(403, 'limit', {}), true],
    [new GitHubApiError(403, 'Forbidden'), false],
    [new GitHubApiError(404, 'Not Found'), false],
    [new GitHubApiError(502, 'Bad Gateway'), true],
    [new GitFetchError(502, 'unreachable'), true],
    [new GitFetchError(401, 'refused'), false],
    [new GitFetchError(404, 'no ref'), false],
    [new InputError('bad url'), false],
    [new TypeError('fetch failed'), true],
  ])('%s → %s', (error, transient) => {
    expect(isTransientDiscoveryError(error)).toBe(transient);
  });
});
