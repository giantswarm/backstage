import { DiscoveryApi, FetchApi } from '@backstage/core-plugin-api';
import { MimirApi, MimirQueryResponse } from './types';

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
    const baseUrl = await this.discoveryApi.getBaseUrl('gs');
    const searchParams = new URLSearchParams({ query, installationName });

    const response = await this.fetchApi.fetch(
      `${baseUrl}/mimir/query?${searchParams.toString()}`,
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

    return response.json() as Promise<MimirQueryResponse>;
  }
}
