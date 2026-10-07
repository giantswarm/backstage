import { UrlReaderService } from '@backstage/backend-plugin-api';
import { ConfigReader } from '@backstage/config';
import { NotFoundError } from '@backstage/errors';
import { GithubCredentialsProvider } from '@backstage/integration';
import {
  BRANCH_CACHE_TTL_MS,
  GithubBranchResolver,
  SlashBranchGithubUrlReader,
} from './githubUrlReader';

const SHA = 'a'.repeat(40);
const OTHER_SHA = 'b'.repeat(40);

const credentialsProvider: GithubCredentialsProvider = {
  getCredentials: jest.fn(async () => ({
    type: 'app' as const,
    headers: { Authorization: 'Bearer app-token' },
    token: 'app-token',
  })),
};

function matchingRefs(...refs: [string, string][]) {
  return jest.fn(
    async (_url: string | URL | Request, _init?: RequestInit) =>
      new Response(
        JSON.stringify(
          refs.map(([name, sha]) => ({
            ref: `refs/heads/${name}`,
            object: { sha, type: 'commit' },
          })),
        ),
      ),
  );
}

function resolver(fetch: jest.Mock, now: () => number = Date.now) {
  return new GithubBranchResolver({
    apiBaseUrl: 'https://api.github.com',
    credentialsProvider,
    fetch: fetch as unknown as typeof globalThis.fetch,
    now,
  });
}

function innerReader(): jest.Mocked<UrlReaderService> {
  return {
    readUrl: jest.fn(async (_url: string, _options?: object) => ({
      buffer: async () => Buffer.from(''),
    })),
    readTree: jest.fn(async (_url: string, _options?: object) => ({}) as any),
    search: jest.fn(async (url: string, _options?: object) => ({
      files: [{ url, content: async () => Buffer.from('') }],
      etag: SHA,
    })),
  };
}

describe('GithubBranchResolver', () => {
  it('replaces a branch with a slash by its head commit', async () => {
    const fetch = matchingRefs(['feat', OTHER_SHA], ['feat/x', SHA]);

    const resolved = await resolver(fetch).resolve(
      'https://github.com/o/r/blob/feat/x/templates/t/template.yaml',
    );

    expect(resolved?.url).toBe(
      `https://github.com/o/r/blob/${SHA}/templates/t/template.yaml`,
    );
    expect(fetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/o/r/git/matching-refs/heads/feat',
      {
        headers: {
          Authorization: 'Bearer app-token',
          Accept: 'application/vnd.github+json',
        },
      },
    );
  });

  it('picks the longest branch the path starts with', async () => {
    const fetch = matchingRefs(
      ['feat/x', OTHER_SHA],
      ['feat/x/y', SHA],
      ['feat/xy', OTHER_SHA],
    );

    const resolved = await resolver(fetch).resolve(
      'https://github.com/o/r/tree/feat/x/y/templates',
    );

    expect(resolved?.url).toBe(`https://github.com/o/r/tree/${SHA}/templates`);
  });

  it('resolves a tree URL that names only the branch', async () => {
    const fetch = matchingRefs(['feat/x', SHA]);

    const resolved = await resolver(fetch).resolve(
      'https://github.com/o/r/tree/feat/x',
    );

    expect(resolved?.url).toBe(`https://github.com/o/r/tree/${SHA}`);
  });

  it('leaves a branch without a slash to the upstream reader', async () => {
    const fetch = matchingRefs(['main', SHA], ['main-old', OTHER_SHA]);

    await expect(
      resolver(fetch).resolve('https://github.com/o/r/blob/main/a/b.yaml'),
    ).resolves.toBeUndefined();
  });

  it('asks nothing for a commit or a URL without a file path', async () => {
    const fetch = matchingRefs();
    const r = resolver(fetch);

    await expect(
      r.resolve(`https://github.com/o/r/blob/${SHA}/a.yaml`),
    ).resolves.toBeUndefined();
    await expect(r.resolve('https://github.com/o/r')).resolves.toBeUndefined();
    await expect(
      r.resolve('https://github.com/o/r/pulls/feat/x'),
    ).resolves.toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reads the branches with the caller's token", async () => {
    const fetch = matchingRefs(['feat/x', SHA]);

    await resolver(fetch).resolve(
      'https://github.com/o/r/blob/feat/x/a.yaml',
      'user-token',
    );

    expect(fetch.mock.calls[0][1]?.headers).toMatchObject({
      Authorization: 'Bearer user-token',
    });
  });

  it('reuses the branches until the cache expires', async () => {
    const fetch = matchingRefs(['feat/x', SHA]);
    let now = 0;
    const r = resolver(fetch, () => now);
    const url = 'https://github.com/o/r/blob/feat/x/a.yaml';

    await r.resolve(url);
    now = BRANCH_CACHE_TTL_MS - 1;
    await r.resolve(url);
    expect(fetch).toHaveBeenCalledTimes(1);

    now = BRANCH_CACHE_TTL_MS;
    await r.resolve(url);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('reports a repository it cannot see as not found', async () => {
    const fetch = jest.fn(async () => new Response('', { status: 404 }));

    await expect(
      resolver(fetch).resolve('https://github.com/o/r/blob/feat/x/a.yaml'),
    ).rejects.toThrow(NotFoundError);
  });
});

describe('SlashBranchGithubUrlReader', () => {
  const url = 'https://github.com/o/r/blob/feat/x/templates/t/template.yaml';
  const resolvedUrl = `https://github.com/o/r/blob/${SHA}/templates/t/template.yaml`;

  it('reads a file and a tree from a branch with a slash', async () => {
    const inner = innerReader();
    const reader = new SlashBranchGithubUrlReader(
      inner,
      resolver(matchingRefs(['feat/x', SHA])),
    );

    await reader.readUrl(url, { etag: 'e' });
    await reader.readTree('https://github.com/o/r/tree/feat/x/templates/t');

    expect(inner.readUrl).toHaveBeenCalledWith(resolvedUrl, { etag: 'e' });
    expect(inner.readTree).toHaveBeenCalledWith(
      `https://github.com/o/r/tree/${SHA}/templates/t`,
      undefined,
    );
  });

  it('names the files it finds by the branch', async () => {
    const inner = innerReader();
    const reader = new SlashBranchGithubUrlReader(
      inner,
      resolver(matchingRefs(['feat/x', SHA])),
    );

    const response = await reader.search(url);

    expect(inner.search).toHaveBeenCalledWith(resolvedUrl, undefined);
    expect(response.files.map(f => f.url)).toEqual([url]);
    expect(response.etag).toBe(SHA);
  });

  it('passes every other URL through unchanged', async () => {
    const inner = innerReader();
    const reader = new SlashBranchGithubUrlReader(
      inner,
      resolver(matchingRefs(['main', SHA])),
    );
    const mainUrl = 'https://github.com/o/r/blob/main/catalog-info.yaml';

    await reader.readUrl(mainUrl);
    const response = await reader.search(mainUrl);

    expect(inner.readUrl).toHaveBeenCalledWith(mainUrl, undefined);
    expect(response.files.map(f => f.url)).toEqual([mainUrl]);
  });

  it('serves every configured GitHub host', () => {
    const tuples = SlashBranchGithubUrlReader.factory({
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
    expect(tuples[0].reader).toBeInstanceOf(SlashBranchGithubUrlReader);
  });
});
