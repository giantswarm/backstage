import { UrlReaderService } from '@backstage/backend-plugin-api';
import { ConfigReader } from '@backstage/config';
import { NotFoundError } from '@backstage/errors';
import {
  GithubCredentialsProvider,
  ScmIntegrations,
} from '@backstage/integration';
import { GithubRefResolver, SlashRefGithubUrlReader } from './githubUrlReader';

const SHA = 'a'.repeat(40);
const OTHER_SHA = 'b'.repeat(40);
const TAG_OBJECT = 'c'.repeat(40);
const API = 'https://api.github.com/repos/o/r';

const integration = ScmIntegrations.fromConfig(
  new ConfigReader({
    integrations: { github: [{ host: 'github.com', token: 't' }] },
  }),
).github.byHost('github.com')!;

const credentialsProvider: GithubCredentialsProvider = {
  getCredentials: jest.fn(async () => ({
    type: 'app' as const,
    headers: { Authorization: 'Bearer app-token' },
    token: 'app-token',
  })),
};

function ref(name: string, sha: string, type = 'commit') {
  return { ref: `refs/${name}`, object: { sha, type, url: `${API}/${sha}` } };
}

/** A fetch answering each URL from `routes`, an empty list for any other. */
function github(routes: Record<string, () => Response> = {}) {
  return jest.fn(
    async (url: string | URL | Request, _init?: RequestInit) =>
      routes[String(url)]?.() ?? new Response('[]'),
  );
}

function json(body: unknown, init?: ResponseInit) {
  return () => new Response(JSON.stringify(body), init);
}

function resolver(fetch: jest.Mock) {
  return new GithubRefResolver({
    integration,
    credentialsProvider,
    fetch: fetch as unknown as typeof globalThis.fetch,
  });
}

const featX = github({
  [`${API}/git/matching-refs/heads/feat/`]: json([ref('heads/feat/x', SHA)]),
});

beforeEach(() => jest.clearAllMocks());

describe('GithubRefResolver', () => {
  it('replaces a branch with a slash by its commit', async () => {
    const signal = new AbortController().signal;

    const resolved = await resolver(featX).resolve(
      'https://github.com/o/r/blob/feat/x/templates/t/template.yaml',
      { signal },
    );

    expect(resolved?.url).toBe(
      `https://github.com/o/r/blob/${SHA}/templates/t/template.yaml`,
    );
    expect(featX).toHaveBeenCalledWith(`${API}/git/matching-refs/heads/feat/`, {
      headers: {
        Authorization: 'Bearer app-token',
        Accept: 'application/vnd.github+json',
      },
      signal,
    });
  });

  it('picks the longest branch the path starts with', async () => {
    const fetch = github({
      [`${API}/git/matching-refs/heads/feat/`]: json([
        ref('heads/feat/x', OTHER_SHA),
        ref('heads/feat/x/y', SHA),
        ref('heads/feat/xy', OTHER_SHA),
      ]),
    });

    const resolved = await resolver(fetch).resolve(
      'https://github.com/o/r/tree/feat/x/y/templates',
    );

    expect(resolved?.url).toBe(`https://github.com/o/r/tree/${SHA}/templates`);
  });

  it('resolves a tree URL that names only the branch', async () => {
    const resolved = await resolver(featX).resolve(
      'https://github.com/o/r/tree/feat/x',
    );

    expect(resolved?.url).toBe(`https://github.com/o/r/tree/${SHA}`);
  });

  it('resolves a branch whose slash is encoded', async () => {
    const resolved = await resolver(featX).resolve(
      'https://github.com/o/r/blob/feat%2Fx/templates/t.yaml',
    );

    expect(resolved).toEqual({
      url: `https://github.com/o/r/blob/${SHA}/templates/t.yaml`,
      refPrefix: '/o/r/blob/feat/x',
      shaPrefix: `/o/r/blob/${SHA}`,
    });
  });

  it('resolves a tag with a slash to the commit it points at', async () => {
    const fetch = github({
      [`${API}/git/matching-refs/tags/release/`]: json([
        ref('tags/release/1.0', TAG_OBJECT, 'tag'),
      ]),
      [`${API}/${TAG_OBJECT}`]: json({
        object: { sha: SHA, type: 'commit', url: '' },
      }),
    });

    const resolved = await resolver(fetch).resolve(
      'https://github.com/o/r/blob/release/1.0/catalog-info.yaml',
    );

    expect(resolved?.url).toBe(
      `https://github.com/o/r/blob/${SHA}/catalog-info.yaml`,
    );
  });

  it('follows the pages of the refs', async () => {
    const fetch = github({
      [`${API}/git/matching-refs/heads/feat/`]: json(
        [ref('heads/feat/a', OTHER_SHA)],
        { headers: { link: `<${API}/page2>; rel="next"` } },
      ),
      [`${API}/page2`]: json([ref('heads/feat/x', SHA)]),
    });

    const resolved = await resolver(fetch).resolve(
      'https://github.com/o/r/blob/feat/x/a.yaml',
    );

    expect(resolved?.url).toBe(`https://github.com/o/r/blob/${SHA}/a.yaml`);
  });

  it('finds nothing when no ref matches', async () => {
    await expect(
      resolver(github()).resolve('https://github.com/o/r/blob/main/a/b.yaml'),
    ).resolves.toBeUndefined();
  });

  it('asks nothing for a commit, a URL without a file path or a broken escape', async () => {
    const fetch = github();
    const r = resolver(fetch);

    for (const url of [
      `https://github.com/o/r/blob/${SHA}/a.yaml`,
      'https://github.com/o/r',
      'https://github.com/o/r/pulls/feat/x',
      'https://github.com/o/r/blob/feat/docs/100%/a.md',
    ]) {
      await expect(r.resolve(url)).resolves.toBeUndefined();
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reads the refs with the caller's token", async () => {
    await resolver(featX).resolve('https://github.com/o/r/blob/feat/x/a.yaml', {
      token: 'user-token',
    });

    expect(featX.mock.calls[0][1]?.headers).toMatchObject({
      Authorization: 'Bearer user-token',
    });
  });

  it('reports a repository it cannot see as not found', async () => {
    const fetch = github({
      [`${API}/git/matching-refs/heads/feat/`]: () =>
        new Response('', { status: 404 }),
    });

    await expect(
      resolver(fetch).resolve('https://github.com/o/r/blob/feat/x/a.yaml'),
    ).rejects.toThrow(NotFoundError);
  });

  it('names a rate limit, never the repository, in its error', async () => {
    const fetch = github({
      [`${API}/git/matching-refs/heads/feat/`]: () =>
        new Response('', {
          status: 403,
          statusText: 'Forbidden',
          headers: { 'x-ratelimit-remaining': '0' },
        }),
    });

    await expect(
      resolver(fetch).resolve('https://github.com/o/r/blob/feat/x/a.yaml'),
    ).rejects.toThrow(
      'Reading the refs of a GitHub repository failed, 403 Forbidden (rate limit exceeded)',
    );
  });
});

describe('SlashRefGithubUrlReader', () => {
  const url = 'https://github.com/o/r/blob/feat/x/templates/t/template.yaml';
  const resolvedUrl = `https://github.com/o/r/blob/${SHA}/templates/t/template.yaml`;
  const notFound = new NotFoundError('not found');

  /** An upstream reader that finds only URLs naming a commit. */
  function upstream(): jest.Mocked<UrlReaderService> {
    const found = (u: string) => u.includes(SHA);
    return {
      readUrl: jest.fn(async (u: string, _options?: object) => {
        if (!found(u)) throw notFound;
        return { buffer: async () => Buffer.from('') };
      }),
      readTree: jest.fn(async (u: string, _options?: object) => {
        if (!found(u)) throw notFound;
        return {} as any;
      }),
      search: jest.fn(async (u: string, _options?: object) => ({
        files: found(u)
          ? [{ url: u, content: async () => Buffer.from('') }]
          : [],
        etag: '',
      })),
    };
  }

  it('reads an ordinary URL without asking for refs', async () => {
    const inner = upstream();
    inner.readUrl.mockResolvedValueOnce({
      buffer: async () => Buffer.from(''),
    });
    const fetch = github();
    const reader = new SlashRefGithubUrlReader(inner, resolver(fetch));

    await reader.readUrl('https://github.com/o/r/blob/main/catalog-info.yaml');

    expect(fetch).not.toHaveBeenCalled();
  });

  it('reads a file and a tree upstream finds nothing at from the resolved ref', async () => {
    const inner = upstream();
    const reader = new SlashRefGithubUrlReader(inner, resolver(featX));

    await reader.readUrl(url, { etag: 'e' });
    await reader.readTree('https://github.com/o/r/tree/feat/x/templates/t');

    expect(inner.readUrl).toHaveBeenLastCalledWith(resolvedUrl, { etag: 'e' });
    expect(inner.readTree).toHaveBeenLastCalledWith(
      `https://github.com/o/r/tree/${SHA}/templates/t`,
      undefined,
    );
  });

  it("throws upstream's not found when no ref matches or the repository is hidden", async () => {
    const hidden = github({
      [`${API}/git/matching-refs/heads/feat/`]: () =>
        new Response('', { status: 404 }),
    });

    for (const fetch of [github(), hidden]) {
      const reader = new SlashRefGithubUrlReader(upstream(), resolver(fetch));
      await expect(reader.readUrl(url)).rejects.toBe(notFound);
      await expect(reader.readTree(url)).rejects.toBe(notFound);
    }
  });

  it('passes any other upstream error through without asking for refs', async () => {
    const inner = upstream();
    const failure = new Error('rate limit exceeded');
    inner.readUrl.mockRejectedValueOnce(failure);
    const fetch = github();
    const reader = new SlashRefGithubUrlReader(inner, resolver(fetch));

    await expect(reader.readUrl(url)).rejects.toBe(failure);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('names the files it finds on a resolved ref by the ref', async () => {
    const inner = upstream();
    const reader = new SlashRefGithubUrlReader(inner, resolver(featX));

    const response = await reader.search(url);

    expect(inner.search).toHaveBeenLastCalledWith(resolvedUrl, undefined);
    expect(response.files.map(f => f.url)).toEqual([url]);
  });

  it("keeps upstream's empty search result, or its not found, when no ref matches", async () => {
    const inner = upstream();
    const reader = new SlashRefGithubUrlReader(inner, resolver(github()));

    await expect(reader.search(url)).resolves.toEqual({ files: [], etag: '' });

    inner.search.mockRejectedValueOnce(notFound);
    await expect(reader.search(url)).rejects.toBe(notFound);
  });

  it('serves every configured GitHub host', () => {
    const tuples = SlashRefGithubUrlReader.factory({
      config: new ConfigReader({
        integrations: {
          github: [
            { host: 'github.com', token: 't' },
            {
              host: 'ghe.example.com',
              apiBaseUrl: 'https://ghe.example.com/api/v3',
            },
          ],
        },
      }),
      logger: {} as any,
      treeResponseFactory: {} as any,
    });

    expect(
      tuples.map(({ predicate }) => [
        predicate(new URL('https://github.com/o/r')),
        predicate(new URL('https://ghe.example.com/o/r')),
      ]),
    ).toEqual([
      [true, false],
      [false, true],
    ]);
    expect(tuples[0].reader).toBeInstanceOf(SlashRefGithubUrlReader);
  });
});
