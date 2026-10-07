import {
  createServiceFactory,
  UrlReaderService,
  UrlReaderServiceReadTreeOptions,
  UrlReaderServiceReadTreeResponse,
  UrlReaderServiceReadUrlOptions,
  UrlReaderServiceReadUrlResponse,
  UrlReaderServiceSearchOptions,
  UrlReaderServiceSearchResponse,
} from '@backstage/backend-plugin-api';
import {
  GithubUrlReader,
  ReaderFactory,
  urlReaderFactoriesServiceRef,
} from '@backstage/backend-defaults/urlReader';
import { NotFoundError } from '@backstage/errors';
import {
  DefaultGithubCredentialsProvider,
  GithubCredentialsProvider,
  ScmIntegrations,
} from '@backstage/integration';

/**
 * How long the branches matching a ref's first path segment are reused. It
 * bounds the GitHub API calls of a catalog refresh, which reads the same
 * locations over and over; a push to a branch with a slash in its name is
 * read at most this late.
 */
export const BRANCH_CACHE_TTL_MS = 60 * 1000;

const FILE_URL_TYPES = new Set(['blob', 'tree', 'raw']);
const COMMIT_SHA = /^[0-9a-f]{40}$/i;

type Fetch = typeof fetch;

type Branch = { name: string; sha: string };

/** A GitHub file or tree URL split into its parts, `/{owner}/{repo}/{type}/{...rest}`. */
interface FileUrl {
  url: URL;
  owner: string;
  repo: string;
  type: string;
  rest: string[];
}

function parseFileUrl(url: string): FileUrl | undefined {
  const parsed = new URL(url);
  const [owner, repo, type, ...rest] = parsed.pathname.split('/').slice(1);
  if (!owner || !repo || !FILE_URL_TYPES.has(type) || rest.length < 2) {
    return undefined;
  }
  return { url: parsed, owner, repo, type, rest };
}

/**
 * Resolves the branch of a GitHub `blob`, `tree` or `raw` URL whose name
 * contains a slash. Such a URL is ambiguous: `blob/feat/x/templates/t.yaml`
 * names branch `feat` and path `x/templates/t.yaml` as much as branch `feat/x`
 * and path `templates/t.yaml`. GitHub's own pages pick the longest branch that
 * matches; the resolver does the same through the branches matching the first
 * segment, and returns the URL with the branch replaced by its head commit,
 * which no parser can split wrongly.
 */
export class GithubBranchResolver {
  private readonly cache = new Map<
    string,
    { expiresAt: number; branches: Promise<Branch[]> }
  >();

  constructor(
    private readonly options: {
      apiBaseUrl: string;
      credentialsProvider: GithubCredentialsProvider;
      fetch?: Fetch;
      now?: () => number;
    },
  ) {}

  /**
   * The URL with a slashed branch replaced by its head commit, or undefined
   * when the URL names no branch with a slash.
   */
  async resolve(
    url: string,
    token?: string,
  ): Promise<
    { url: string; branchPrefix: string; shaPrefix: string } | undefined
  > {
    const fileUrl = parseFileUrl(url);
    if (!fileUrl || COMMIT_SHA.test(fileUrl.rest[0])) {
      return undefined;
    }
    const { owner, repo, type, rest } = fileUrl;
    const branches = await this.branchesStartingWith(url, fileUrl, token);
    const restPath = rest.map(decodeURIComponent).join('/');
    const branch = branches
      .filter(
        b =>
          b.name.includes('/') &&
          (restPath === b.name || restPath.startsWith(`${b.name}/`)),
      )
      .sort((a, b) => b.name.length - a.name.length)[0];
    if (!branch) {
      return undefined;
    }

    const branchSegments = branch.name.split('/').length;
    const base = `/${owner}/${repo}/${type}`;
    const resolved = new URL(fileUrl.url);
    resolved.pathname = [base, branch.sha, ...rest.slice(branchSegments)].join(
      '/',
    );
    return {
      url: resolved.toString(),
      branchPrefix: `${base}/${rest.slice(0, branchSegments).join('/')}`,
      shaPrefix: `${base}/${branch.sha}`,
    };
  }

  private branchesStartingWith(
    url: string,
    { owner, repo, rest }: FileUrl,
    token?: string,
  ): Promise<Branch[]> {
    const key = `${owner}/${repo}/${rest[0]}`;
    const now = (this.options.now ?? Date.now)();
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > now) {
      return cached.branches;
    }
    const branches = this.fetchBranches(url, owner, repo, rest[0], token);
    this.cache.set(key, { expiresAt: now + BRANCH_CACHE_TTL_MS, branches });
    branches.catch(() => this.cache.delete(key));
    return branches;
  }

  private async fetchBranches(
    url: string,
    owner: string,
    repo: string,
    prefix: string,
    token?: string,
  ): Promise<Branch[]> {
    const headers = token
      ? { Authorization: `Bearer ${token}` }
      : (await this.options.credentialsProvider.getCredentials({ url }))
          .headers;
    const endpoint = `${this.options.apiBaseUrl}/repos/${owner}/${repo}/git/matching-refs/heads/${prefix}`;
    const response = await (this.options.fetch ?? fetch)(endpoint, {
      headers: { ...headers, Accept: 'application/vnd.github+json' },
    });
    if (response.status === 404) {
      throw new NotFoundError(`Request failed for ${endpoint}, 404`);
    }
    if (!response.ok) {
      throw new Error(
        `Request failed for ${endpoint}, ${response.status} ${response.statusText}`,
      );
    }
    const refs = (await response.json()) as {
      ref: string;
      object: { sha: string };
    }[];
    return refs.map(ref => ({
      name: ref.ref.replace(/^refs\/heads\//, ''),
      sha: ref.object.sha,
    }));
  }
}

/**
 * A GitHub URL reader that reads branches whose name contains a slash
 * (`feat/x`, `fix/y`), which the upstream reader takes for a branch `feat`
 * and a path starting with `x/`. Every other URL reaches the upstream reader
 * unchanged.
 */
export class SlashBranchGithubUrlReader implements UrlReaderService {
  static factory: ReaderFactory = ({ config, treeResponseFactory }) => {
    const integrations = ScmIntegrations.fromConfig(config);
    const credentialsProvider =
      DefaultGithubCredentialsProvider.fromIntegrations(integrations);
    return integrations.github
      .list()
      .filter(integration => integration.config.apiBaseUrl)
      .map(integration => ({
        reader: new SlashBranchGithubUrlReader(
          new GithubUrlReader(integration, {
            treeResponseFactory,
            credentialsProvider,
          }),
          new GithubBranchResolver({
            apiBaseUrl: integration.config.apiBaseUrl!,
            credentialsProvider,
          }),
        ),
        predicate: (url: URL) => url.host === integration.config.host,
      }));
  };

  constructor(
    private readonly reader: UrlReaderService,
    private readonly resolver: GithubBranchResolver,
  ) {}

  async readUrl(
    url: string,
    options?: UrlReaderServiceReadUrlOptions,
  ): Promise<UrlReaderServiceReadUrlResponse> {
    const resolved = await this.resolver.resolve(url, options?.token);
    return this.reader.readUrl(resolved?.url ?? url, options);
  }

  async readTree(
    url: string,
    options?: UrlReaderServiceReadTreeOptions,
  ): Promise<UrlReaderServiceReadTreeResponse> {
    const resolved = await this.resolver.resolve(url, options?.token);
    return this.reader.readTree(resolved?.url ?? url, options);
  }

  async search(
    url: string,
    options?: UrlReaderServiceSearchOptions,
  ): Promise<UrlReaderServiceSearchResponse> {
    const resolved = await this.resolver.resolve(url, options?.token);
    if (!resolved) {
      return this.reader.search(url, options);
    }
    // The files found are named by the branch, so a location registered from
    // them follows the branch rather than the commit read now.
    const response = await this.reader.search(resolved.url, options);
    return {
      ...response,
      files: response.files.map(file => {
        const fileUrl = new URL(file.url);
        if (fileUrl.pathname.startsWith(`${resolved.shaPrefix}/`)) {
          fileUrl.pathname =
            resolved.branchPrefix +
            fileUrl.pathname.slice(resolved.shaPrefix.length);
        }
        return { ...file, url: fileUrl.toString() };
      }),
    };
  }

  toString() {
    return `slashBranch(${this.reader})`;
  }
}

/**
 * Registers {@link SlashBranchGithubUrlReader} ahead of the default readers,
 * so it serves every configured GitHub host.
 */
export const githubUrlReaderFactory = createServiceFactory({
  service: urlReaderFactoriesServiceRef,
  deps: {},
  async factory() {
    return SlashBranchGithubUrlReader.factory;
  },
});
