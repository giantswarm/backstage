import { LoggerService } from '@backstage/backend-plugin-api';
import { ActionsRegistryService } from '@backstage/backend-plugin-api/alpha';
import { NotFoundError } from '@backstage/errors';
import { GithubCredentialsProvider } from '@backstage/integration';
import { registerMcpActions } from './mcpActions';
import { containerRegistryServiceRef } from './services/ContainerRegistryService';

// Mock node-fetch
jest.mock('node-fetch', () => jest.fn());

import fetch from 'node-fetch';

const mockFetch = fetch as unknown as jest.Mock;

const VALUES_SCHEMA_ANNOTATION = 'io.giantswarm.application.values-schema';
const DEPRECATED_VALUES_SCHEMA_ANNOTATION =
  'application.giantswarm.io/values-schema';

describe('registerMcpActions', () => {
  let actionsRegistry: jest.Mocked<ActionsRegistryService>;
  let containerRegistry: jest.Mocked<
    Pick<typeof containerRegistryServiceRef.T, 'getTagManifest'>
  >;
  let githubCredentialsProvider: jest.Mocked<GithubCredentialsProvider>;
  let logger: jest.Mocked<LoggerService>;
  let registeredAction: Parameters<ActionsRegistryService['register']>[0];

  beforeEach(() => {
    actionsRegistry = {
      register: jest.fn(),
    };
    containerRegistry = {
      getTagManifest: jest.fn(),
    };
    githubCredentialsProvider = {
      getCredentials: jest.fn().mockResolvedValue({ token: 'ghp_test-token' }),
    };
    logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      child: jest.fn().mockReturnThis(),
    } as unknown as jest.Mocked<LoggerService>;

    registerMcpActions(
      actionsRegistry,
      containerRegistry as unknown as typeof containerRegistryServiceRef.T,
      githubCredentialsProvider,
      logger,
    );

    registeredAction = actionsRegistry.register.mock.calls[0][0];
    mockFetch.mockReset();
  });

  it('registers the get-helm-chart-values action', () => {
    expect(actionsRegistry.register).toHaveBeenCalledTimes(1);
    expect(registeredAction.name).toBe('get-helm-chart-values');
    expect(registeredAction.attributes).toEqual({ readOnly: true });
  });

  it('fetches schema using the current annotation', async () => {
    const schemaUrl =
      'https://raw.githubusercontent.com/giantswarm/my-app/refs/tags/v1.0.0/helm/my-app/values.schema.json';
    const schemaContent = JSON.stringify({ type: 'object', properties: {} });

    containerRegistry.getTagManifest.mockResolvedValue({
      schemaVersion: 2,
      mediaType: 'application/vnd.oci.image.manifest.v1+json',
      config: { mediaType: '', size: 0, digest: '' },
      layers: [],
      annotations: {
        [VALUES_SCHEMA_ANNOTATION]: schemaUrl,
      },
    });

    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => schemaContent,
    });

    const result = await registeredAction.action({
      input: {
        registry: 'gsoci.azurecr.io',
        repository: 'charts/giantswarm/my-app',
        tag: '1.0.0',
        content: 'schema',
      },
      logger,
      credentials: {} as any,
    });

    expect(containerRegistry.getTagManifest).toHaveBeenCalledWith(
      'gsoci.azurecr.io',
      'charts/giantswarm/my-app',
      '1.0.0',
    );
    expect(mockFetch).toHaveBeenCalledWith(schemaUrl, {
      headers: { Authorization: 'Bearer ghp_test-token' },
    });
    expect(githubCredentialsProvider.getCredentials).toHaveBeenCalledWith({
      url: 'https://github.com/giantswarm/my-app',
    });
    expect(result).toEqual({
      output: {
        url: schemaUrl,
        content: schemaContent,
        contentType: 'schema',
      },
    });
  });

  it('fetches values.yaml when content is "values"', async () => {
    const schemaUrl =
      'https://raw.githubusercontent.com/giantswarm/my-app/refs/tags/v1.0.0/helm/my-app/values.schema.json';
    const valuesUrl =
      'https://raw.githubusercontent.com/giantswarm/my-app/refs/tags/v1.0.0/helm/my-app/values.yaml';
    const valuesContent = 'key: value\n';

    containerRegistry.getTagManifest.mockResolvedValue({
      schemaVersion: 2,
      mediaType: 'application/vnd.oci.image.manifest.v1+json',
      config: { mediaType: '', size: 0, digest: '' },
      layers: [],
      annotations: {
        [VALUES_SCHEMA_ANNOTATION]: schemaUrl,
      },
    });

    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => valuesContent,
    });

    const result = await registeredAction.action({
      input: {
        registry: 'gsoci.azurecr.io',
        repository: 'charts/giantswarm/my-app',
        tag: '1.0.0',
        content: 'values',
      },
      logger,
      credentials: {} as any,
    });

    expect(mockFetch).toHaveBeenCalledWith(valuesUrl, {
      headers: { Authorization: 'Bearer ghp_test-token' },
    });
    expect(result).toEqual({
      output: {
        url: valuesUrl,
        content: valuesContent,
        contentType: 'values',
      },
    });
  });

  it('falls back to deprecated annotation', async () => {
    const schemaUrl =
      'https://raw.githubusercontent.com/giantswarm/my-app/refs/tags/v1.0.0/helm/my-app/values.schema.json';

    containerRegistry.getTagManifest.mockResolvedValue({
      schemaVersion: 2,
      mediaType: 'application/vnd.oci.image.manifest.v1+json',
      config: { mediaType: '', size: 0, digest: '' },
      layers: [],
      annotations: {
        [DEPRECATED_VALUES_SCHEMA_ANNOTATION]: schemaUrl,
      },
    });

    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => '{}',
    });

    const result = await registeredAction.action({
      input: {
        registry: 'gsoci.azurecr.io',
        repository: 'charts/giantswarm/my-app',
        tag: '1.0.0',
        content: 'schema',
      },
      logger,
      credentials: {} as any,
    });

    expect(mockFetch).toHaveBeenCalledWith(schemaUrl, {
      headers: { Authorization: 'Bearer ghp_test-token' },
    });
    expect(result).toEqual({
      output: {
        url: schemaUrl,
        content: '{}',
        contentType: 'schema',
      },
    });
  });

  it('throws NotFoundError when no annotation is present', async () => {
    containerRegistry.getTagManifest.mockResolvedValue({
      schemaVersion: 2,
      mediaType: 'application/vnd.oci.image.manifest.v1+json',
      config: { mediaType: '', size: 0, digest: '' },
      layers: [],
      annotations: {},
    });

    await expect(
      registeredAction.action({
        input: {
          registry: 'gsoci.azurecr.io',
          repository: 'charts/giantswarm/my-app',
          tag: '1.0.0',
          content: 'schema',
        },
        logger,
        credentials: {} as any,
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it('throws NotFoundError when annotations are undefined', async () => {
    containerRegistry.getTagManifest.mockResolvedValue({
      schemaVersion: 2,
      mediaType: 'application/vnd.oci.image.manifest.v1+json',
      config: { mediaType: '', size: 0, digest: '' },
      layers: [],
    });

    await expect(
      registeredAction.action({
        input: {
          registry: 'gsoci.azurecr.io',
          repository: 'charts/giantswarm/my-app',
          tag: '1.0.0',
          content: 'schema',
        },
        logger,
        credentials: {} as any,
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it('throws when fetch returns non-200', async () => {
    containerRegistry.getTagManifest.mockResolvedValue({
      schemaVersion: 2,
      mediaType: 'application/vnd.oci.image.manifest.v1+json',
      config: { mediaType: '', size: 0, digest: '' },
      layers: [],
      annotations: {
        [VALUES_SCHEMA_ANNOTATION]: 'https://example.com/schema.json',
      },
    });

    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    await expect(
      registeredAction.action({
        input: {
          registry: 'gsoci.azurecr.io',
          repository: 'charts/giantswarm/my-app',
          tag: '1.0.0',
          content: 'schema',
        },
        logger,
        credentials: {} as any,
      }),
    ).rejects.toThrow('Failed to fetch schema from');

    expect(githubCredentialsProvider.getCredentials).not.toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledWith('https://example.com/schema.json', {
      headers: {},
    });
  });

  it('falls back to unauthenticated fetch when credentials provider fails', async () => {
    const schemaUrl =
      'https://raw.githubusercontent.com/giantswarm/my-app/refs/tags/v1.0.0/helm/my-app/values.schema.json';
    const schemaContent = '{}';

    containerRegistry.getTagManifest.mockResolvedValue({
      schemaVersion: 2,
      mediaType: 'application/vnd.oci.image.manifest.v1+json',
      config: { mediaType: '', size: 0, digest: '' },
      layers: [],
      annotations: {
        [VALUES_SCHEMA_ANNOTATION]: schemaUrl,
      },
    });

    githubCredentialsProvider.getCredentials.mockRejectedValue(
      new Error('No GitHub integration configured'),
    );

    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => schemaContent,
    });

    const result = await registeredAction.action({
      input: {
        registry: 'gsoci.azurecr.io',
        repository: 'charts/giantswarm/my-app',
        tag: '1.0.0',
        content: 'schema',
      },
      logger,
      credentials: {} as any,
    });

    expect(mockFetch).toHaveBeenCalledWith(schemaUrl, { headers: {} });
    expect(result).toEqual({
      output: {
        url: schemaUrl,
        content: schemaContent,
        contentType: 'schema',
      },
    });
  });
});
