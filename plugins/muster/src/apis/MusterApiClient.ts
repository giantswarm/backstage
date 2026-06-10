import {
  createApiRef,
  DiscoveryApi,
  FetchApi,
} from '@backstage/core-plugin-api';
import {
  ListExecutionsOptions,
  MusterApi,
  WorkflowExecution,
  WorkflowExecutionListResponse,
  WorkflowGetResponse,
  WorkflowListResponse,
} from './types';

export const musterApiRef = createApiRef<MusterApi>({
  id: 'plugin.muster.api',
});

export class MusterApiClient implements MusterApi {
  private readonly discoveryApi: DiscoveryApi;
  private readonly fetchApi: FetchApi;

  constructor(options: { discoveryApi: DiscoveryApi; fetchApi: FetchApi }) {
    this.discoveryApi = options.discoveryApi;
    this.fetchApi = options.fetchApi;
  }

  async listWorkflows(): Promise<WorkflowListResponse> {
    return this.get<WorkflowListResponse>('/workflows');
  }

  async getWorkflow(name: string): Promise<WorkflowGetResponse> {
    return this.get<WorkflowGetResponse>(
      `/workflows/${encodeURIComponent(name)}`,
    );
  }

  async listExecutions(
    options: ListExecutionsOptions = {},
  ): Promise<WorkflowExecutionListResponse> {
    const searchParams = new URLSearchParams();
    if (options.workflowName) {
      searchParams.set('workflow_name', options.workflowName);
    }
    if (options.status) {
      searchParams.set('status', options.status);
    }
    if (options.limit !== undefined) {
      searchParams.set('limit', String(options.limit));
    }
    if (options.offset !== undefined) {
      searchParams.set('offset', String(options.offset));
    }
    const query = searchParams.toString();
    return this.get<WorkflowExecutionListResponse>(
      `/executions${query ? `?${query}` : ''}`,
    );
  }

  async getExecution(executionId: string): Promise<WorkflowExecution> {
    return this.get<WorkflowExecution>(
      `/executions/${encodeURIComponent(executionId)}`,
    );
  }

  private async get<T>(path: string): Promise<T> {
    const baseUrl = await this.discoveryApi.getBaseUrl('muster');
    const response = await this.fetchApi.fetch(`${baseUrl}${path}`);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const message =
        (errorData as { error?: { message?: string } })?.error?.message ??
        `Muster request failed with status ${response.status}`;
      const error = new Error(message);
      if (response.status === 401) error.name = 'UnauthorizedError';
      if (response.status === 403) error.name = 'ForbiddenError';
      if (response.status === 404) error.name = 'NotFoundError';
      if (response.status === 503) error.name = 'ServiceUnavailableError';
      throw error;
    }

    return response.json() as Promise<T>;
  }
}
