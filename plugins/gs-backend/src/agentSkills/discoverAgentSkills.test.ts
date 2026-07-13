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
      if (url.includes('/git/trees/')) {
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

    const { skills, truncated } = await discoverAgentSkills({
      repoUrl: 'https://github.com/giantswarm/agent-skills',
      githubCredentialsProvider: credentialsProvider,
    });

    expect(truncated).toBe(false);
    expect(skills).toEqual([
      {
        name: 'Demo',
        description: 'A demo.',
        repoUrl: 'https://github.com/giantswarm/agent-skills',
        path: 'demo',
        ref: 'main',
      },
      {
        name: 'Incident responder',
        description: '',
        repoUrl: 'https://github.com/giantswarm/agent-skills',
        path: 'sre/incident',
        ref: 'main',
      },
    ]);
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

  it('drops a skill whose content read fails and flags truncated (no total failure)', async () => {
    global.fetch = mockGitHub(
      [
        { path: 'ok/SKILL.md', type: 'blob' },
        { path: 'bad/SKILL.md', type: 'blob' },
      ],
      { 'ok/SKILL.md': '---\nname: Ok\n---' },
      { failContentFor: 'bad/SKILL.md' },
    ) as unknown as typeof fetch;

    const { skills, truncated } = await discoverAgentSkills({
      repoUrl: 'https://github.com/giantswarm/agent-skills',
      githubCredentialsProvider: credentialsProvider,
    });

    expect(skills.map(s => s.path)).toEqual(['ok']);
    expect(truncated).toBe(true);
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
  });
});
