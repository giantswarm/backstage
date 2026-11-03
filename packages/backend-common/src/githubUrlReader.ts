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
import { isError, NotFoundError } from '@backstage/errors';
import {
  DefaultGithubCredentialsProvider,
  GithubCredentialsProvider,
  GithubIntegration,
  ScmIntegrations,
} from '@backstage/integration';

const FILE_URL_TYPES = new Set(['blob', 'tree', 'raw']);
const COMMIT_SHA = /^[0-9a-f]{40}$/i;

type Fetch = typeof fetch;

type ResolveOptions = { token?: string; signal?: AbortSignal };

type Ref = { name: string; sha: string };

type GitRef = {
  ref: string;
  object: { sha: string; type: string; url: string };
};

/** A ref resolved to its commit, and the URL prefixes naming it either way. */
interface ResolvedUrl {
  url: string;
  refPrefix: string;
  shaPrefix: string;
}

/**
 * A GitHub file or tree URL split into `/{owner}/{repo}/{type}` and the
 * segments after it, an encoded slash (`feat%2Fx`) splitting a segment too.
 */
interface FileUrl {
  url: URL;
  owner: string;
  repo: string;
  base: string;
  rest: string[];
}

function parseFileUrl(url: string): FileUrl | undefined {
  const parsed = new URL(url);
  const [owner, repo, type, ...segments] = parsed.pathname.split('/').slice(1);
  const rest = segments.flatMap(segment => segment.split(/%2F/i));
  if (
    !owner ||
    !repo ||
    !FILE_URL_TYPES.has(type) ||
    rest.length < 2 ||
    COMMIT_SHA.test(rest[0])
  ) {
    return undefined;
  }
  return { url: parsed, owner, repo, base: `/${owner}/${repo}/${type}`, rest };
}

function decodeSegment(segment: string): string | undefined {
  try {
    return decodeURIComponent(segment);
  } catch {
    return undefined;
  }
}

function isNotFound(error: unknown): boolean {
  return isError(error) && error.name === 'NotFoundError';
}

function nextPage(response: Response): string | undefined {
  return response.headers.get('link')?.match(/<([^>]+)>;\s*rel="next"/)?.[1];
}

/**
 * Resolves the ref of a GitHub `blob`, `tree` or `raw` URL whose name
 * contains a slash. Such a URL is ambiguous: `blob/feat/x/templates/t.yaml`
 * names ref `feat` and path `x/templates/t.yaml` as much as ref `feat/x` and
 * path `templates/t.yaml`. GitHub's own pages pick the longest branch, else
 * tag, that the path starts with; the resolver does the same through the refs
 * under the first segment, and returns the URL with the ref replaced by its
 * commit, which no parser can split wrongly.
 */
export class GithubRefResolver {
  constructor(
    private readonly options: {
      integration: GithubIntegration;
      credentialsProvider: GithubCredentialsProvider;
      fetch?: Fetch;
    },
  ) {}

  /**
   * The URL with a ref containing a slash replaced by its commit, or
   * undefined when no such ref matches the URL.
   */
  async resolve(
    url: string,
    options: ResolveOptions = {},
  ): Promise<ResolvedUrl | undefined> {
    const fileUrl = parseFileUrl(url);
    const decoded = fileUrl?.rest.map(decodeSegment);
    if (!fileUrl || !decoded || decoded.includes(undefined)) {
      return undefined;
    }
    const path = decoded.join('/');
    const headers = await this.headers(url, options.token);

    for (const namespace of ['heads', 'tags']) {
      const refs = await this.refsUnder(fileUrl, namespace, headers, options);
      const ref = refs
        .filter(r => path === r.name || path.startsWith(`${r.name}/`))
        .sort((a, b) => b.name.length - a.name.length)[0];
      if (ref) {
        const { base, rest } = fileUrl;
        const segments = ref.name.split('/').length;
        const resolved = new URL(fileUrl.url);
        resolved.pathname = [base, ref.sha, ...rest.slice(segments)].join('/');
        return {
          url: resolved.toString(),
          refPrefix: [base, ...rest.slice(0, segments)].join('/'),
          shaPrefix: `${base}/${ref.sha}`,
        };
      }
    }
    return undefined;
  }

  private async headers(
    url: string,
    token?: string,
  ): Promise<Record<string, string>> {
    const auth = token
      ? { Authorization: `Bearer ${token}` }
      : (await this.options.credentialsProvider.getCredentials({ url }))
          .headers;
    return { ...auth, Accept: 'application/vnd.github+json' };
  }

  /** The refs under `{namespace}/{first segment}/`, tags peeled to commits. */
  private async refsUnder(
    { owner, repo, rest }: FileUrl,
    namespace: string,
    headers: Record<string, string>,
    { signal }: ResolveOptions,
  ): Promise<Ref[]> {
    const { apiBaseUrl } = this.options.integration.config;
    const refs: Ref[] = [];
    let page: string | undefined =
      `${apiBaseUrl}/repos/${owner}/${repo}/git/matching-refs/${namespace}/${rest[0]}/`;
    while (page) {
      const response = await this.fetch(page, headers, signal);
      for (const { ref, object } of (await response.json()) as GitRef[]) {
        refs.push({
          name: ref.replace(`refs/${namespace}/`, ''),
          sha: await this.commitOf(object, headers, signal),
        });
      }
      page = nextPage(response);
    }
    return refs;
  }

  /** The commit an annotated tag points at, or the ref's own commit. */
  private async commitOf(
    object: GitRef['object'],
    headers: Record<string, string>,
    signal?: AbortSignal,
  ): Promise<string> {
    let target = object;
    while (target.type === 'tag') {
      const response = await this.fetch(target.url, headers, signal);
      target = ((await response.json()) as { object: GitRef['object'] }).object;
    }
    return target.sha;
  }

  private async fetch(
    url: string,
    headers: Record<string, string>,
    signal?: AbortSignal,
  ): Promise<Response> {
    const response = await (this.options.fetch ?? fetch)(url, {
      headers,
      signal,
    });
    if (response.ok) {
      return response;
    }
    // The message stays the same for every repository: it is what error
    // reporting groups by.
    const message = `Reading the refs of a GitHub repository failed, ${response.status} ${response.statusText}`;
    if (response.status === 404) {
      throw new NotFoundError(message);
    }
    const rateLimited =
      this.options.integration.parseRateLimitInfo(response).isRateLimited;
    throw new Error(rateLimited ? `${message} (rate limit exceeded)` : message);
  }
}

/**
 * A GitHub URL reader that also reads refs whose name contains a slash
 * (`feat/x`, `release/1.0`), which the upstream reader takes for a ref `feat`
 * and a path starting with `x/`. Every URL is read as upstream reads it
 * first; only a URL upstream finds nothing at is resolved, since Git keeps no
 * ref `feat` beside a ref `feat/x`. Ordinary reads cost no extra request.
 */
export class SlashRefGithubUrlReader implements UrlReaderService {
  static factory: ReaderFactory = ({ config, treeResponseFactory }) => {
    const integrations = ScmIntegrations.fromConfig(config);
    const credentialsProvider =
      DefaultGithubCredentialsProvider.fromIntegrations(integrations);
    return integrations.github
      .list()
      .filter(integration => integration.config.apiBaseUrl)
      .map(integration => ({
        reader: new SlashRefGithubUrlReader(
          new GithubUrlReader(integration, {
            treeResponseFactory,
            credentialsProvider,
          }),
          new GithubRefResolver({ integration, credentialsProvider }),
        ),
        predicate: (url: URL) => url.host === integration.config.host,
      }));
  };

  constructor(
    private readonly reader: UrlReaderService,
    private readonly resolver: GithubRefResolver,
  ) {}

  async readUrl(
    url: string,
    options?: UrlReaderServiceReadUrlOptions,
  ): Promise<UrlReaderServiceReadUrlResponse> {
    try {
      return await this.reader.readUrl(url, options);
    } catch (error) {
      const resolved = isNotFound(error) && (await this.resolve(url, options));
      if (!resolved) {
        throw error;
      }
      return this.reader.readUrl(resolved.url, options);
    }
  }

  async readTree(
    url: string,
    options?: UrlReaderServiceReadTreeOptions,
  ): Promise<UrlReaderServiceReadTreeResponse> {
    try {
      return await this.reader.readTree(url, options);
    } catch (error) {
      const resolved = isNotFound(error) && (await this.resolve(url, options));
      if (!resolved) {
        throw error;
      }
      return this.reader.readTree(resolved.url, options);
    }
  }

  async search(
    url: string,
    options?: UrlReaderServiceSearchOptions,
  ): Promise<UrlReaderServiceSearchResponse> {
    let found: UrlReaderServiceSearchResponse | undefined;
    let notFound: unknown;
    try {
      found = await this.reader.search(url, options);
      if (found.files.length > 0) {
        return found;
      }
    } catch (error) {
      if (!isNotFound(error)) {
        throw error;
      }
      notFound = error;
    }

    const resolved = await this.resolve(url, options);
    if (!resolved) {
      if (found) {
        return found;
      }
      throw notFound;
    }
    // The files found are named by the ref, so a location registered from
    // them follows the branch rather than the commit read now.
    const response = await this.reader.search(resolved.url, options);
    return {
      ...response,
      files: response.files.map(file => {
        const fileUrl = new URL(file.url);
        if (fileUrl.pathname.startsWith(`${resolved.shaPrefix}/`)) {
          fileUrl.pathname =
            resolved.refPrefix +
            fileUrl.pathname.slice(resolved.shaPrefix.length);
        }
        return { ...file, url: fileUrl.toString() };
      }),
    };
  }

  toString() {
    return `slashRef(${this.reader})`;
  }

  /** The resolved URL; a repository the resolver cannot see has none. */
  private async resolve(
    url: string,
    options?: ResolveOptions,
  ): Promise<ResolvedUrl | undefined> {
    try {
      return await this.resolver.resolve(url, {
        token: options?.token,
        signal: options?.signal,
      });
    } catch (error) {
      if (isNotFound(error)) {
        return undefined;
      }
      throw error;
    }
  }
}

/**
 * Registers {@link SlashRefGithubUrlReader} ahead of the default readers, so
 * it serves every configured GitHub host with an API.
 */
export const githubUrlReaderFactory = createServiceFactory({
  service: urlReaderFactoriesServiceRef,
  deps: {},
  async factory() {
    return SlashRefGithubUrlReader.factory;
  },
});
