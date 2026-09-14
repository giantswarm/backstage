import { DiscoveryApi, FetchApi } from '@backstage/core-plugin-api';
import { MimirApi, MimirQueryResponse, MimirRangeQueryResponse } from './types';

export class MimirClient implements MimirApi {
  private readonly discoveryApi: DiscoveryApi;
  private readonly fetchApi: FetchApi;

  constructor(options: { discoveryApi: DiscoveryApi; fetchApi: FetchApi }) {
    this.discoveryApi = options.discoveryApi;
    this.fetchApi = options.fetchApi;
  }

  async query(params: {
    installationName: string;
    query: string;
    oidcToken: string;
  }): Promise<MimirQueryResponse> {
    const { installationName, query, oidcToken } = params;

    return this.get<MimirQueryResponse>(
      'query',
      { query, installationName },
      oidcToken,
    );
  }

  async queryRange(params: {
    installationName: string;
    query: string;
    start: string;
    end: string;
    step: string;
    oidcToken: string;
  }): Promise<MimirRangeQueryResponse> {
    const { installationName, query, start, end, step, oidcToken } = params;

    return this.get<MimirRangeQueryResponse>(
      'query_range',
      { query, installationName, start, end, step },
      oidcToken,
    );
  }

  /**
   * The shared request leg. The token travels in `X-Mimir-Token` rather than
   * `Authorization`, which on this hop carries the *Backstage* identity — the
   * same split `KAGENT_AUTH_HEADER` makes for kagent.
   */
  private async get<T>(
    path: 'query' | 'query_range',
    params: Record<string, string>,
    oidcToken: string,
  ): Promise<T> {
    const baseUrl = await this.discoveryApi.getBaseUrl('gs');
    const searchParams = new URLSearchParams(params);

    const response = await this.fetchApi.fetch(
      `${baseUrl}/mimir/${path}?${searchParams.toString()}`,
      {
        headers: {
          'X-Mimir-Token': oidcToken,
        },
      },
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const message =
        (errorData as any)?.error?.message ??
        `Mimir query failed with status ${response.status}`;
      const error = new Error(message);
      if (response.status === 401) error.name = 'UnauthorizedError';
      if (response.status === 403) error.name = 'ForbiddenError';
      if (response.status === 404) error.name = 'NotFoundError';
      throw error;
    }

    return response.json() as Promise<T>;
  }
}
