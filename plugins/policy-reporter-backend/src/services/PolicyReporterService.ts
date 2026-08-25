import {
  createServiceFactory,
  createServiceRef,
  RootConfigService,
  coreServices,
} from '@backstage/backend-plugin-api';
import { ResponseError, NotFoundError } from '@backstage/errors';
import { Expand } from '@backstage/types';
import {
  type Target,
  type Config,
  type ResultList,
  type ResourceResultList,
  type ResourceResult,
  type PolicyResult,
  type Profile,
  type LayoutConfig,
  type Dashboard,
  type ResourceDetails,
  type SourceDetails,
  type PolicyFilter,
  type PolicyDetails,
  type ExceptionResponse,
} from '@internal/backstage-plugin-policy-reporter-common';

type QueryPrimitive = string | number | boolean;
type QueryValue = QueryPrimitive | QueryPrimitive[] | undefined;
type QueryParams = Record<string, QueryValue>;

type EntityScope = {
  cluster?: string;
};

type ScopedQuery = EntityScope & {
  query?: QueryParams;
};

type BinaryResponse = {
  data: Buffer;
  contentType?: string;
};

type ClusterTarget = {
  clusterName: string;
  endpoint: string;
};

export class PolicyReporterService {
  readonly #baseURL: string;

  #nsExcludes: string[] = [];
  #clusterExcludes: string[] = [];

  static create(options: {
    config: RootConfigService;
  }) {
    return new PolicyReporterService(options.config);
  }

  private constructor(config: RootConfigService) {
    this.#baseURL = config.getOptionalString('policy-reporter.endpoint') ?? '';

    if (!this.#baseURL) {
      throw new NotFoundError('cluster path parameter is required');
    }
  }

  setExcludes(nsFilter: string[], clusterFilter: string[]): void {
    this.#nsExcludes = nsFilter;
    this.#clusterExcludes = clusterFilter;
  }

  async profile(): Promise<Profile> {
    return this.#requestJson({}, '/profile');
  }

  async layout(input: EntityScope): Promise<LayoutConfig> {
    return this.#requestClusterJson(input, cluster => `/api/config/${cluster}/layout`);
  }

  async config(): Promise<Config> {
    return this.#requestJson({}, '/api/config');
  }

  async dashboard(input: ScopedQuery): Promise<Dashboard> {
    return this.#requestClusterJson(
      input,
      cluster => `/api/${cluster}/dashboard`,
      this.#applyExcludes(input.query, [...this.#nsExcludes, ...this.#clusterExcludes]),
    );
  }

  async customBoard(
    input: ScopedQuery & { id: string },
  ): Promise<Dashboard> {
    return this.#requestClusterJson(
      input,
      cluster => `/api/${cluster}/custom-board/${input.id}`,
      this.#applyExcludes(input.query, [...this.#nsExcludes, ...this.#clusterExcludes]),
    );
  }

  async resource(
    input: ScopedQuery & { id: string },
  ): Promise<ResourceDetails> {
    return this.#requestClusterJson(
      input,
      cluster => `/api/${cluster}/resource/${input.id}`,
      input.query,
    );
  }

  async createException(
    input: EntityScope & {
      id: string;
      source: string;
      policies?: unknown[];
      category?: string;
    },
  ): Promise<ExceptionResponse> {
    return this.#requestClusterJson(
      input,
      cluster => `/api/${cluster}/resource/${input.id}/exception`,
      undefined,
      'POST',
      {
        source: input.source,
        policies: input.policies,
        category: input.category,
      },
    );
  }

  async policySources(input: ScopedQuery): Promise<{ filter: PolicyFilter; sources: SourceDetails[] }> {
    return this.#requestClusterJson(
      input,
      cluster => `/api/${cluster}/policy-sources`,
      this.#applyExcludes(input.query, [...this.#nsExcludes, ...this.#clusterExcludes]),
    );
  }

  async policyDetails(
    input: EntityScope & {
      source: string;
      policy: string;
      namespace?: string;
      status?: string[];
      kinds?: string[];
    },
  ): Promise<PolicyDetails> {
    return this.#requestClusterJson(
      input,
      cluster => `/api/${cluster}/${input.source}/policy/details`,
      this.#applyExcludes(
        {
          policies: [input.policy],
          namespace: input.namespace,
          status: input.status,
          kinds: input.kinds,
        },
        [...this.#nsExcludes, ...this.#clusterExcludes],
        input.source,
      ),
    );
  }

  async policyHTMLReport(
    input: ScopedQuery & { source: string },
  ): Promise<BinaryResponse> {
    return this.#requestClusterBinary(
      input,
      cluster => `/api/${cluster}/${input.source}/policy-report`,
      input.query,
    );
  }

  async namespaceHTMLReport(
    input: ScopedQuery & { source: string },
  ): Promise<BinaryResponse> {
    return this.#requestClusterBinary(
      input,
      cluster => `/api/${cluster}/${input.source}/namespace-report`,
      input.query,
    );
  }

  async policies(
    input: ScopedQuery & { source: string },
  ): Promise<{ [category: string]: PolicyResult[] }> {
    return this.#requestClusterJson(
      input,
      cluster => `/api/${cluster}/${input.source}/policies`,
      this.#applyExcludes(input.query, this.#nsExcludes),
    );
  }

  async targets(input: EntityScope): Promise<{ [type: string]: Target[] }> {
    return this.#requestClusterJson(input, cluster => `/api/${cluster}/targets`);
  }

  async namespaces(input: ScopedQuery): Promise<string[]> {
    return this.#requestClusterJson(
      input,
      cluster => `/api/${cluster}/namespaces`,
      input.query,
    );
  }

  async namespace(input: ScopedQuery): Promise<Dashboard> {
    return this.#requestClusterJson(
      input,
      cluster => `/api/${cluster}/namespace`,
      input.query,
    );
  }

  async namespacedResults(input: ScopedQuery): Promise<ResultList> {
    return this.#requestClusterJson(
      input,
      cluster => `/api/${cluster}/namespace-scoped/results`,
      this.#mergeQuery(this.#applyExcludes(input.query, this.#nsExcludes), undefined),
    );
  }

  async clusterResults(input: ScopedQuery): Promise<ResultList> {
    return this.#requestClusterJson(
      input,
      cluster => `/api/${cluster}/cluster-scoped/results`,
      this.#mergeQuery(this.#applyExcludes(input.query, this.#nsExcludes), undefined),
    );
  }

  async namespacedResourceResults(
    input: ScopedQuery,
  ): Promise<ResourceResultList> {
    return this.#requestClusterJson(
      input,
      cluster => `/api/${cluster}/namespace-scoped/resource-results`,
      this.#mergeQuery(this.#applyExcludes(input.query, this.#nsExcludes), undefined),
    );
  }

  async clusterResourceResults(
    input: ScopedQuery,
  ): Promise<ResourceResultList> {
    return this.#requestClusterJson(
      input,
      cluster => `/api/${cluster}/cluster-scoped/resource-results`,
      this.#mergeQuery(this.#applyExcludes(input.query, this.#clusterExcludes), undefined),
    );
  }

  async resourceResults(
    input: ScopedQuery & { id: string },
  ): Promise<ResourceResult[]> {
    return this.#requestClusterJson(
      input,
      cluster => `/api/${cluster}/resource/${input.id}/resource-results`,
      input.query,
    );
  }

  async results(
    input: ScopedQuery & { id: string },
  ): Promise<ResultList> {
    return this.#requestClusterJson(
      input,
      cluster => `/api/${cluster}/resource/${input.id}/results`,
      input.query,
    );
  }

  async resultsWithoutResources(
    input: ScopedQuery,
  ): Promise<ResultList> {
    return this.#requestClusterJson(
      input,
      cluster => `/api/${cluster}/results-without-resource`,
      input.query,
    );
  }

  async clustersDashboard(input: ScopedQuery): Promise<Dashboard> {
    return this.#requestJson(
      input,
      '/api/clusters',
      this.#applyExcludes(input.query, [...this.#nsExcludes, ...this.#clusterExcludes]),
    );
  }

  async totalResults(
    input: ScopedQuery,
  ): Promise<ResourceResultList> {
    return this.#requestClusterJson(
      input,
      cluster => `/api/${cluster}/total-results`,
      this.#mergeQuery(
        this.#applyExcludes(input.query, [...this.#nsExcludes, ...this.#clusterExcludes]),
        undefined,
      ),
    );
  }

  async customBoardNamespacedResourceResults(
    input: ScopedQuery & { id: string },
  ): Promise<ResourceResultList> {
    return this.#requestClusterJson(
      input,
      cluster => `/api/${cluster}/custom-board/${input.id}/resource-results`,
      this.#mergeQuery(this.#applyExcludes(input.query, this.#nsExcludes), undefined),
    );
  }

  async customBoardNamespacedResults(
    input: ScopedQuery & { id: string },
  ): Promise<ResultList> {
    return this.#requestClusterJson(
      input,
      cluster => `/api/${cluster}/custom-board/${input.id}/results`,
      this.#mergeQuery(this.#applyExcludes(input.query, this.#nsExcludes), undefined),
    );
  }

  async customBoardClusterResourceResults(
    input: ScopedQuery & { id: string },
  ): Promise<ResourceResultList> {
    return this.#requestClusterJson(
      input,
      cluster => `/api/${cluster}/custom-board/${input.id}/cluster-resource-results`,
      this.#mergeQuery(this.#applyExcludes(input.query, this.#nsExcludes), undefined),
    );
  }

  async customBoardClusterResults(
    input: ScopedQuery & { id: string },
  ): Promise<ResultList> {
    return this.#requestClusterJson(
      input,
      cluster => `/api/${cluster}/custom-board/${input.id}/cluster-results`,
      this.#mergeQuery(this.#applyExcludes(input.query, this.#nsExcludes), undefined),
    );
  }

  async customBoardResource(
    input: ScopedQuery & { id: string, resource: string },
  ): Promise<ResultList> {
    return this.#requestClusterJson(
      input,
      cluster => `/api/${cluster}/custom-board/${input.id}/resource/${input.resource}`,
      this.#mergeQuery(this.#applyExcludes(input.query, this.#nsExcludes), undefined),
    );
  }

  async customBoardResourceResults(
    input: ScopedQuery & { id: string, resource: string },
  ): Promise<ResultList> {
    return this.#requestClusterJson(
      input,
      cluster => `/api/${cluster}/custom-board/${input.id}/resource/${input.resource}/results`,
      input.query,
    );
  }

  async #requestClusterJson<T>(
    input: EntityScope,
    path: (cluster: string) => string,
    query?: QueryParams,
    method: 'GET' | 'POST' = 'GET',
    body?: unknown,
  ): Promise<T> {
    const target = await this.#resolveTarget(input);
    return this.#fetchJson<T>(target.endpoint, path(target.clusterName), query, method, body);
  }

  async #requestClusterBinary(
    input: EntityScope,
    path: (cluster: string) => string,
    query?: QueryParams,
  ): Promise<BinaryResponse> {
    const target = await this.#resolveTarget(input);
    return this.#fetchBinary(target.endpoint, path(target.clusterName), query);
  }

  async #requestJson<T>(
    input: EntityScope,
    path: string,
    query?: QueryParams,
  ): Promise<T> {
    const target = await this.#resolveTarget(input);
    return this.#fetchJson<T>(target.endpoint, path, query);
  }

  async #fetchJson<T = unknown>(
    endpoint: string,
    path: string,
    query?: QueryParams,
    method: 'GET' | 'POST' = 'GET',
    body?: unknown,
  ): Promise<T> {
    console.log(this.#buildUrl(endpoint, path, query));
    const response = await fetch(this.#buildUrl(endpoint, path, query), {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      throw await ResponseError.fromResponse(response);
    }

    return response.json() as T;
  }

  async #fetchBinary(
    endpoint: string,
    path: string,
    query?: QueryParams,
  ): Promise<BinaryResponse> {
    const response = await fetch(this.#buildUrl(endpoint, path, query));

    if (!response.ok) {
      throw await ResponseError.fromResponse(response);
    }

    return {
      data: Buffer.from(await response.arrayBuffer()),
      contentType: response.headers.get('content-type') ?? undefined,
    };
  }

  async #resolveTarget(input: EntityScope): Promise<ClusterTarget> {

    return {
      clusterName: input.cluster ?? '',
      endpoint: this.#baseURL,
    };
  }

  #buildUrl(endpoint: string, path: string, query?: QueryParams): string {
    const url = new URL(path, `${endpoint}/`);

    for (const [key, rawValue] of Object.entries(query ?? {})) {
      if (rawValue === undefined) {
        continue;
      }

      if (Array.isArray(rawValue)) {
        for (const value of rawValue) {
          url.searchParams.append(key, String(value));
        }
      } else {
        url.searchParams.append(key, String(rawValue));
      }
    }

    return url.toString();
  }

  #applyExcludes(
    filter: QueryParams | undefined,
    exclude: string[] | undefined,
    source?: string,
  ): QueryParams | undefined {
    if (!filter) {
      return exclude && exclude.length > 0 ? { exclude } : undefined;
    }

    const kinds = this.#asStringArray(filter.kinds);
    if (kinds && kinds.length > 0) {
      return filter;
    }

    if (!exclude || exclude.length < 1) {
      return filter;
    }

    let resolvedExclude = exclude;

    const sources = this.#asStringArray(filter.sources);
    if (sources && sources.length > 0) {
      resolvedExclude = resolvedExclude.filter(value =>
        sources.some(sourceValue => value.startsWith(sourceValue)),
      );
    }

    if (source) {
      resolvedExclude = resolvedExclude.filter(value => value.startsWith(source));
    }

    return {
      ...filter,
      exclude: resolvedExclude,
    };
  }

  #mergeQuery(
    query: QueryParams | undefined,
    extra: QueryParams | undefined,
  ): QueryParams | undefined {
    if (!query && !extra) {
      return undefined;
    }

    return {
      ...query,
      ...extra,
    };
  }

  #asStringArray(value: QueryValue): string[] | undefined {
    if (Array.isArray(value)) {
      return value.map(item => String(item));
    }
    if (value === undefined) {
      return undefined;
    }
    return [String(value)];
  }
}

export const policyReporterServiceRef = createServiceRef<Expand<PolicyReporterService>>({
  id: 'policy-reporter',
  defaultFactory: async service =>
    createServiceFactory({
      service,
      deps: {
        config: coreServices.rootConfig,
      },
      async factory(deps) {
        return PolicyReporterService.create(deps);
      },
    }),
});
