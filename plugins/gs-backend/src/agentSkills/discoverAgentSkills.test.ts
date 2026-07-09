import { GithubCredentialsProvider } from '@backstage/integration';
import { parseFrontmatter } from './frontmatter';
import { discoverAgentSkills, parseRepoUrl } from './discoverAgentSkills';

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
  ) {
    return jest.fn(async (url: string) => {
      if (/\/repos\/[^/]+\/[^/]+$/.test(url)) {
        return {
          ok: true,
          json: async () => ({ default_branch: 'main' }),
        } as Response;
      }
      if (url.includes('/git/trees/')) {
        return { ok: true, json: async () => ({ tree }) } as Response;
      }
      const match = url.match(/\/contents\/(.+)\?ref=/);
      if (match) {
        const path = decodeURIComponent(match[1]);
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

    const skills = await discoverAgentSkills({
      repoUrl: 'https://github.com/giantswarm/agent-skills',
      githubCredentialsProvider: credentialsProvider,
    });

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

    const [skill] = await discoverAgentSkills({
      repoUrl: 'https://github.com/giantswarm/agent-skills',
      githubCredentialsProvider: credentialsProvider,
    });

    expect(skill.name).toBe('pr-review');
    expect(skill.description).toBe('');
  });
});
