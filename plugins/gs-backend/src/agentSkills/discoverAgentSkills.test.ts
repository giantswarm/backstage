import { GithubCredentialsProvider } from '@backstage/integration';
import { parseFrontmatter } from './frontmatter';
import {
  discoverAgentSkills,
  GitHubApiError,
  parseRepoUrl,
} from './discoverAgentSkills';

describe('parseFrontmatter', () => {
  it('extracts name and description', () => {
    expect(
      parseFrontmatter(
        '---\nname: demo\ndescription: A demo skill.\n---\n\nBody text.',
      ),
    ).toEqual({ name: 'demo', description: 'A demo skill.' });
  });

  it('returns empty when there is no frontmatter', () => {
    expect(parseFrontmatter('# Just a heading\n')).toEqual({});
  });

  it('ignores non-string / missing fields', () => {
    expect(parseFrontmatter('---\nname: demo\n---\n')).toEqual({
      name: 'demo',
      description: undefined,
    });
  });

  it('handles descriptions containing colons', () => {
    const fm = parseFrontmatter(
      '---\nname: x\ndescription: "Use for: a, b, c"\n---\n',
    );
    expect(fm.description).toBe('Use for: a, b, c');
  });
});

describe('parseRepoUrl', () => {
  it('splits owner and repo, tolerating .git and trailing slash', () => {
    expect(parseRepoUrl('https://github.com/giantswarm/agent-skills')).toEqual({
      owner: 'giantswarm',
      repo: 'agent-skills',
    });
    expect(
      parseRepoUrl('https://github.com/giantswarm/agent-skills.git/'),
    ).toEqual({ owner: 'giantswarm', repo: 'agent-skills' });
  });

  it('rejects non-github URLs', () => {
    expect(() => parseRepoUrl('https://gitlab.com/a/b')).toThrow();
  });
});

describe('discoverAgentSkills', () => {
  /** The head of `main` the fixture repository is read at. */
  const HEAD = 'cb1fb768ba1d1b1e62c6e0b32c39a6b4bd3b58a1';

  const credentialsProvider = {
    getCredentials: async () => ({ token: 'tok', headers: {} }),
  } as unknown as GithubCredentialsProvider;

  function mockGitHub(
    tree: Array<{ path: string; type: string }>,
    contents: Record<string, string>,
    opts: { truncated?: boolean; failContentFor?: string } = {},
  ) {
    return jest.fn(async (url: string) => {
      if (/\/repos\/[^/]+\/[^/]+$/.test(url)) {
        return {
          ok: true,
          json: async () => ({ default_branch: 'main' }),
        } as Response;
      }
      if (url.includes('/commits/')) {
        return { ok: true, text: async () => `${HEAD}\n` } as Response;
      }
      if (url.includes(`/git/trees/${HEAD}?`)) {
        return {
          ok: true,
          json: async () => ({ tree, truncated: Boolean(opts.truncated) }),
        } as Response;
      }
      const match = url.match(/\/contents\/(.+)\?ref=/);
      if (match) {
        const path = decodeURIComponent(match[1]);
        if (opts.failContentFor && path === opts.failContentFor) {
          return {
            ok: false,
            status: 429,
            statusText: 'Too Many Requests',
          } as Response;
        }
        return { ok: true, text: async () => contents[path] } as Response;
      }
      throw new Error(`unexpected url ${url}`);
    });
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('finds every SKILL.md and maps it to a skill (repo url + dir path)', async () => {
    global.fetch = mockGitHub(
      [
        { path: 'README.md', type: 'blob' },
        { path: 'demo/SKILL.md', type: 'blob' },
        { path: 'sre/incident/SKILL.md', type: 'blob' },
        { path: 'some/dir', type: 'tree' },
      ],
      {
        'demo/SKILL.md': '---\nname: Demo\ndescription: A demo.\n---\nbody',
        'sre/incident/SKILL.md': '---\nname: Incident responder\n---\nbody',
      },
    ) as unknown as typeof fetch;

    const { skills, truncated, ref, commit } = await discoverAgentSkills({
      repoUrl: 'https://github.com/giantswarm/agent-skills',
      githubCredentialsProvider: credentialsProvider,
    });

    expect(truncated).toBe(false);
    expect(ref).toBe('main');
    expect(commit).toBe(HEAD);
    expect(skills).toEqual([
      {
        name: 'Demo',
        description: 'A demo.',
        repoUrl: 'https://github.com/giantswarm/agent-skills',
        path: 'demo',
        ref: 'main',
        commit: HEAD,
        contentReadable: true,
      },
      {
        name: 'Incident responder',
        description: '',
        repoUrl: 'https://github.com/giantswarm/agent-skills',
        path: 'sre/incident',
        ref: 'main',
        commit: HEAD,
        contentReadable: true,
      },
    ]);
  });

  it('reads the tree and every SKILL.md at the resolved commit, not at the branch', async () => {
    // What the picker shows is what the agent pins: a push to the branch
    // between the tree read and the content read must not slip in.
    const fetchMock = mockGitHub([{ path: 'demo/SKILL.md', type: 'blob' }], {
      'demo/SKILL.md': '---\nname: Demo\n---',
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await discoverAgentSkills({
      repoUrl: 'https://github.com/giantswarm/agent-skills',
      githubCredentialsProvider: credentialsProvider,
    });

    const urls = fetchMock.mock.calls.map(([url]) => url as string);
    expect(urls).toContain(
      `https://api.github.com/repos/giantswarm/agent-skills/commits/main`,
    );
    expect(urls).toContain(
      `https://api.github.com/repos/giantswarm/agent-skills/git/trees/${HEAD}?recursive=1`,
    );
    expect(urls).toContain(
      `https://api.github.com/repos/giantswarm/agent-skills/contents/demo/SKILL.md?ref=${HEAD}`,
    );
  });

  it('resolves an explicit ref to its commit', async () => {
    global.fetch = mockGitHub([{ path: 'demo/SKILL.md', type: 'blob' }], {
      'demo/SKILL.md': '---\nname: Demo\n---',
    }) as unknown as typeof fetch;

    const { skills } = await discoverAgentSkills({
      repoUrl: 'https://github.com/giantswarm/agent-skills',
      githubCredentialsProvider: credentialsProvider,
      ref: 'v1.2.0',
    });

    expect(skills[0].ref).toBe('v1.2.0');
    expect(skills[0].commit).toBe(HEAD);
  });

  it('falls back to the directory basename when frontmatter has no name', async () => {
    global.fetch = mockGitHub([{ path: 'pr-review/SKILL.md', type: 'blob' }], {
      'pr-review/SKILL.md': 'no frontmatter here',
    }) as unknown as typeof fetch;

    const { skills } = await discoverAgentSkills({
      repoUrl: 'https://github.com/giantswarm/agent-skills',
      githubCredentialsProvider: credentialsProvider,
    });

    expect(skills[0].name).toBe('pr-review');
    expect(skills[0].description).toBe('');
  });

  it('flags truncated when GitHub caps the tree', async () => {
    global.fetch = mockGitHub(
      [{ path: 'demo/SKILL.md', type: 'blob' }],
      { 'demo/SKILL.md': '---\nname: Demo\n---' },
      { truncated: true },
    ) as unknown as typeof fetch;

    const { skills, truncated } = await discoverAgentSkills({
      repoUrl: 'https://github.com/giantswarm/agent-skills',
      githubCredentialsProvider: credentialsProvider,
    });

    expect(skills).toHaveLength(1);
    expect(truncated).toBe(true);
  });

  it('lists a skill whose content read fails as unreadable, from the tree (no total failure)', async () => {
    global.fetch = mockGitHub(
      [
        { path: 'ok/SKILL.md', type: 'blob' },
        { path: 'sre/bad/SKILL.md', type: 'blob' },
      ],
      { 'ok/SKILL.md': '---\nname: Ok\n---' },
      { failContentFor: 'sre/bad/SKILL.md' },
    ) as unknown as typeof fetch;

    const { skills, truncated, contents } = await discoverAgentSkills({
      repoUrl: 'https://github.com/giantswarm/agent-skills',
      githubCredentialsProvider: credentialsProvider,
    });

    expect(skills).toEqual([
      expect.objectContaining({ path: 'ok', contentReadable: true }),
      expect.objectContaining({
        path: 'sre/bad',
        name: 'bad',
        description: '',
        commit: HEAD,
        contentReadable: false,
      }),
    ]);
    // Nothing is missing from the listing: the tree had every skill.
    expect(truncated).toBe(false);
    expect([...contents.keys()]).toEqual(['ok']);
  });

  it('keeps what it read: every SKILL.md by skill path', async () => {
    global.fetch = mockGitHub([{ path: 'demo/SKILL.md', type: 'blob' }], {
      'demo/SKILL.md': '---\nname: Demo\n---\nbody',
    }) as unknown as typeof fetch;

    const { contents } = await discoverAgentSkills({
      repoUrl: 'https://github.com/giantswarm/agent-skills',
      githubCredentialsProvider: credentialsProvider,
    });

    expect(contents).toEqual(new Map([['demo', '---\nname: Demo\n---\nbody']]));
  });

  describe('revalidating a previous snapshot', () => {
    const tree = [
      { path: 'ok/SKILL.md', type: 'blob' },
      { path: 'bad/SKILL.md', type: 'blob' },
    ];

    async function firstRead() {
      global.fetch = mockGitHub(
        tree,
        { 'ok/SKILL.md': '---\nname: Ok\n---' },
        { failContentFor: 'bad/SKILL.md' },
      ) as unknown as typeof fetch;
      return discoverAgentSkills({
        repoUrl: 'https://github.com/giantswarm/agent-skills',
        githubCredentialsProvider: credentialsProvider,
      });
    }

    it('reads neither the tree nor a file already read while the ref has not moved; retries the unreadable', async () => {
      const previous = await firstRead();
      const fetchMock = mockGitHub(tree, {
        'ok/SKILL.md': '---\nname: Ok\n---',
        'bad/SKILL.md': '---\nname: Now readable\n---',
      });
      global.fetch = fetchMock as unknown as typeof fetch;

      const { skills, contents } = await discoverAgentSkills({
        repoUrl: 'https://github.com/giantswarm/agent-skills',
        githubCredentialsProvider: credentialsProvider,
        previous,
      });

      const urls = fetchMock.mock.calls.map(([url]) => url as string);
      expect(urls).toEqual([
        'https://api.github.com/repos/giantswarm/agent-skills',
        'https://api.github.com/repos/giantswarm/agent-skills/commits/main',
        `https://api.github.com/repos/giantswarm/agent-skills/contents/bad/SKILL.md?ref=${HEAD}`,
      ]);
      expect(skills).toEqual([
        expect.objectContaining({
          path: 'bad',
          name: 'Now readable',
          contentReadable: true,
        }),
        expect.objectContaining({
          path: 'ok',
          name: 'Ok',
          contentReadable: true,
        }),
      ]);
      expect([...contents.keys()].sort()).toEqual(['bad', 'ok']);
    });

    it('reads everything again once the ref points at another commit', async () => {
      const previous = await firstRead();
      const fetchMock = mockGitHub(tree, {
        'ok/SKILL.md': '---\nname: Ok\n---',
        'bad/SKILL.md': '---\nname: Bad\n---',
      });
      global.fetch = fetchMock as unknown as typeof fetch;

      await discoverAgentSkills({
        repoUrl: 'https://github.com/giantswarm/agent-skills',
        githubCredentialsProvider: credentialsProvider,
        previous: { ...previous, commit: 'a'.repeat(40) },
      });

      const urls = fetchMock.mock.calls.map(([url]) => url as string);
      expect(urls).toContain(
        `https://api.github.com/repos/giantswarm/agent-skills/git/trees/${HEAD}?recursive=1`,
      );
      expect(urls).toContain(
        `https://api.github.com/repos/giantswarm/agent-skills/contents/ok/SKILL.md?ref=${HEAD}`,
      );
    });

    it("keeps an unreadable skill's previous name and description at a new commit", async () => {
      global.fetch = mockGitHub(
        tree,
        { 'bad/SKILL.md': '---\nname: Bad\n---' },
        { failContentFor: 'ok/SKILL.md' },
      ) as unknown as typeof fetch;

      const { skills } = await discoverAgentSkills({
        repoUrl: 'https://github.com/giantswarm/agent-skills',
        githubCredentialsProvider: credentialsProvider,
        previous: {
          skills: [
            {
              name: 'Ok skill',
              description: 'Was readable.',
              repoUrl: 'https://github.com/giantswarm/agent-skills',
              path: 'ok',
              ref: 'main',
              commit: 'a'.repeat(40),
              contentReadable: true,
            },
          ],
          ref: 'main',
          commit: 'a'.repeat(40),
          truncated: false,
          contents: new Map(),
        },
      });

      expect(skills.find(s => s.path === 'ok')).toEqual(
        expect.objectContaining({
          name: 'Ok skill',
          description: 'Was readable.',
          commit: HEAD,
          contentReadable: false,
        }),
      );
    });
  });

  it('throws a GitHubApiError carrying the upstream status when the repo is missing', async () => {
    global.fetch = jest.fn(async () => {
      return { ok: false, status: 404, statusText: 'Not Found' } as Response;
    }) as unknown as typeof fetch;

    const error = await discoverAgentSkills({
      repoUrl: 'https://github.com/giantswarm/does-not-exist',
      githubCredentialsProvider: credentialsProvider,
    }).catch(e => e);

    expect(error).toBeInstanceOf(GitHubApiError);
    expect(error.status).toBe(404);
    expect(error.rateLimited).toBe(false);
  });

  function rateLimited(status: number) {
    return jest.fn(async () => {
      return {
        ok: false,
        status,
        statusText: '',
        headers: new Headers({
          'x-ratelimit-remaining': '0',
          'x-ratelimit-reset': String(Date.UTC(2026, 9, 9, 14, 5) / 1000),
        }),
      } as Response;
    }) as unknown as typeof fetch;
  }

  it('says an unauthenticated read ran out of GitHub rate limit', async () => {
    global.fetch = rateLimited(403);

    const error = await discoverAgentSkills({
      repoUrl: 'https://github.com/giantswarm/agent-skills',
      githubCredentialsProvider: {
        getCredentials: async () => {
          throw new Error('no integration');
        },
      } as unknown as GithubCredentialsProvider,
    }).catch(e => e);

    expect(error).toBeInstanceOf(GitHubApiError);
    expect(error.status).toBe(403);
    expect(error.message).toBe(
      "GitHub's API rate limit for this portal's IP address is used up until 14:05 UTC: the portal reads GitHub without a token, which GitHub allows 60 requests an hour per IP.",
    );
  });

  it('says an authenticated read ran out of GitHub rate limit', async () => {
    global.fetch = rateLimited(429);

    const error = await discoverAgentSkills({
      repoUrl: 'https://github.com/giantswarm/agent-skills',
      githubCredentialsProvider: credentialsProvider,
    }).catch(e => e);

    expect(error.status).toBe(429);
    expect(error.message).toBe(
      "GitHub's API rate limit for the portal's token is used up until 14:05 UTC.",
    );
    // When to ask again: the window's reset.
    expect(error.rateLimited).toBe(true);
    expect(error.rateLimit.retryAt).toBe(Date.UTC(2026, 9, 9, 14, 5));
  });

  it("says GitHub's secondary rate limit refused a read", async () => {
    global.fetch = jest.fn(async () => {
      return {
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        headers: new Headers({
          'retry-after': '60',
          'x-ratelimit-remaining': '4321',
        }),
      } as Response;
    }) as unknown as typeof fetch;

    const error = await discoverAgentSkills({
      repoUrl: 'https://github.com/giantswarm/agent-skills',
      githubCredentialsProvider: credentialsProvider,
    }).catch(e => e);

    expect(error.status).toBe(403);
    expect(error.message).toBe(
      "GitHub's secondary rate limit refused the read: too many requests in a short time. Try again in 60 seconds.",
    );
    expect(error.rateLimited).toBe(true);
  });

  it('keeps the plain status for a 403 with requests left', async () => {
    global.fetch = jest.fn(async () => {
      return {
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        headers: new Headers({ 'x-ratelimit-remaining': '42' }),
      } as Response;
    }) as unknown as typeof fetch;

    const error = await discoverAgentSkills({
      repoUrl: 'https://github.com/giantswarm/private-skills',
      githubCredentialsProvider: credentialsProvider,
    }).catch(e => e);

    expect(error.message).toBe(
      'GitHub API https://api.github.com/repos/giantswarm/private-skills returned 403: Forbidden',
    );
    // An access refusal, not a rate limit: no stale listing papers over it.
    expect(error.rateLimited).toBe(false);
  });
});
