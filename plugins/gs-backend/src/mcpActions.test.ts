import { LoggerService } from '@backstage/backend-plugin-api';
import { ActionsRegistryService } from '@backstage/backend-plugin-api/alpha';
import type { Entity } from '@backstage/catalog-model';
import { NotFoundError } from '@backstage/errors';
import { GithubCredentialsProvider } from '@backstage/integration';
import type { catalogServiceRef } from '@backstage/plugin-catalog-node';
import { registerMcpActions } from './mcpActions';
import { containerRegistryServiceRef } from '@giantswarm/backstage-plugin-gs-node';

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
  let catalog: jest.Mocked<Pick<typeof catalogServiceRef.T, 'getEntityByRef'>>;
  let logger: jest.Mocked<LoggerService>;
  let helmAction: Parameters<ActionsRegistryService['register']>[0];
  let pagerDutyAction: Parameters<ActionsRegistryService['register']>[0];

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
    catalog = {
      getEntityByRef: jest.fn(),
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
      catalog as unknown as typeof catalogServiceRef.T,
      logger,
    );

    helmAction = actionsRegistry.register.mock.calls[0][0];
    pagerDutyAction = actionsRegistry.register.mock.calls[1][0];
    mockFetch.mockReset();
  });

  it('registers the get-helm-chart-values action', () => {
    expect(actionsRegistry.register).toHaveBeenCalledTimes(2);
    expect(helmAction.name).toBe('get-helm-chart-values');
    expect(helmAction.attributes).toEqual({ readOnly: true });
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

    const result = await helmAction.action({
      input: {
        registry: 'gsoci.azurecr.io',
        repository: 'charts/giantswarm/my-app',
        tag: '1.0.0',
        content: 'schema',
      },
      logger,
      credentials: {} as any,
      secrets: {} as any,
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

    const result = await helmAction.action({
      input: {
        registry: 'gsoci.azurecr.io',
        repository: 'charts/giantswarm/my-app',
        tag: '1.0.0',
        content: 'values',
      },
      logger,
      credentials: {} as any,
      secrets: {} as any,
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

    const result = await helmAction.action({
      input: {
        registry: 'gsoci.azurecr.io',
        repository: 'charts/giantswarm/my-app',
        tag: '1.0.0',
        content: 'schema',
      },
      logger,
      credentials: {} as any,
      secrets: {} as any,
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
      helmAction.action({
        input: {
          registry: 'gsoci.azurecr.io',
          repository: 'charts/giantswarm/my-app',
          tag: '1.0.0',
          content: 'schema',
        },
        logger,
        credentials: {} as any,
        secrets: {} as any,
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
      helmAction.action({
        input: {
          registry: 'gsoci.azurecr.io',
          repository: 'charts/giantswarm/my-app',
          tag: '1.0.0',
          content: 'schema',
        },
        logger,
        credentials: {} as any,
        secrets: {} as any,
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
      helmAction.action({
        input: {
          registry: 'gsoci.azurecr.io',
          repository: 'charts/giantswarm/my-app',
          tag: '1.0.0',
          content: 'schema',
        },
        logger,
        credentials: {} as any,
        secrets: {} as any,
      }),
    ).rejects.toThrow('Failed to fetch schema from');

    expect(githubCredentialsProvider.getCredentials).not.toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledWith('https://example.com/schema.json');
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

    const result = await helmAction.action({
      input: {
        registry: 'gsoci.azurecr.io',
        repository: 'charts/giantswarm/my-app',
        tag: '1.0.0',
        content: 'schema',
      },
      logger,
      credentials: {} as any,
      secrets: {} as any,
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

  describe('get-pagerduty-ids-for-entity', () => {
    const mkEntity = (
      kind: string,
      name: string,
      annotations: Record<string, string>,
    ): Entity => ({
      apiVersion: 'backstage.io/v1alpha1',
      kind,
      metadata: { name, namespace: 'default', annotations },
    });

    it('registers the action with the expected metadata', () => {
      expect(pagerDutyAction.name).toBe('get-pagerduty-ids-for-entity');
      expect(pagerDutyAction.attributes).toEqual({
        readOnly: true,
        idempotent: true,
      });
    });

    it('returns serviceId for a Group entity', async () => {
      catalog.getEntityByRef.mockResolvedValue(
        mkEntity('Group', 'team-otter', {
          'pagerduty.com/service-id': 'PABC123',
        }),
      );

      const result = await pagerDutyAction.action({
        input: { entityRef: 'group:default/team-otter' },
        logger,
        credentials: {} as any,
        secrets: {} as any,
      });

      expect(catalog.getEntityByRef).toHaveBeenCalledWith(
        { kind: 'group', namespace: 'default', name: 'team-otter' },
        { credentials: {} },
      );
      expect(result).toEqual({
        output: {
          entityRef: 'group:default/team-otter',
          kind: 'Group',
          serviceId: 'PABC123',
        },
      });
    });

    it('returns serviceId for a Component entity', async () => {
      catalog.getEntityByRef.mockResolvedValue(
        mkEntity('Component', 'my-app', {
          'pagerduty.com/service-id': 'PDEF456',
        }),
      );

      const result = await pagerDutyAction.action({
        input: { entityRef: 'component:default/my-app' },
        logger,
        credentials: {} as any,
        secrets: {} as any,
      });

      expect(result).toEqual({
        output: {
          entityRef: 'component:default/my-app',
          kind: 'Component',
          serviceId: 'PDEF456',
        },
      });
    });

    it('returns userId for a User entity', async () => {
      catalog.getEntityByRef.mockResolvedValue(
        mkEntity('User', 'jdoe', {
          'pagerduty.com/user-id': 'PXYZ789',
        }),
      );

      const result = await pagerDutyAction.action({
        input: { entityRef: 'user:default/jdoe' },
        logger,
        credentials: {} as any,
        secrets: {} as any,
      });

      expect(result).toEqual({
        output: {
          entityRef: 'user:default/jdoe',
          kind: 'User',
          userId: 'PXYZ789',
        },
      });
    });

    it('throws NotFoundError when the entity does not exist', async () => {
      catalog.getEntityByRef.mockResolvedValue(undefined);

      await expect(
        pagerDutyAction.action({
          input: { entityRef: 'component:default/missing' },
          logger,
          credentials: {} as any,
          secrets: {} as any,
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it('throws NotFoundError when the entity has neither PagerDuty annotation', async () => {
      catalog.getEntityByRef.mockResolvedValue(
        mkEntity('Component', 'my-app', {}),
      );

      await expect(
        pagerDutyAction.action({
          input: { entityRef: 'component:default/my-app' },
          logger,
          credentials: {} as any,
          secrets: {} as any,
        }),
      ).rejects.toThrow(NotFoundError);
    });
  });
});
