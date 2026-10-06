import { ScaffolderClient } from '@backstage/plugin-scaffolder';
import type { TemplateParameterSchema } from '@backstage/plugin-scaffolder-common';
import type {
  KubernetesApi,
  KubernetesAuthProvidersApi,
} from '@backstage/plugin-kubernetes-react';
import { DiscoveryApiClient } from '../discovery/DiscoveryApiClient';
import { ScaffolderApiClient } from './ScaffolderApiClient';
import { TemplateSignInError } from './TemplateSignInError';

const manifest = {
  title: 'Template',
  steps: [
    {
      title: 'Details',
      schema: {
        type: 'object',
        properties: {
          mode: { type: 'string', enum: ['apply', 'commit'] },
        },
        dependencies: {
          mode: {
            oneOf: [
              {
                properties: {
                  mode: { const: 'apply' },
                  token: {
                    type: 'object',
                    'ui:field': 'GSOIDCToken',
                    'ui:options': { secretsKey: 'USER_OIDC_TOKEN' },
                  },
                },
              },
              { properties: { mode: { const: 'commit' } } },
            ],
          },
        },
      },
    },
  ],
} as unknown as TemplateParameterSchema;

describe('ScaffolderApiClient.scaffold', () => {
  const getCredentials = jest.fn();
  const kubernetesApi = {
    getCluster: jest.fn(async (name: string) => ({
      authProvider: 'oidc',
      oidcTokenProvider: `oidc-${name}`,
    })),
  } as unknown as KubernetesApi;
  const kubernetesAuthProvidersApi = {
    getCredentials,
  } as unknown as KubernetesAuthProvidersApi;

  let superScaffold: jest.SpyInstance;
  let setInstallation: jest.SpyInstance;
  let client: ScaffolderApiClient;

  beforeEach(() => {
    getCredentials.mockReset();
    jest
      .spyOn(ScaffolderClient.prototype, 'getTemplateParameterSchema')
      .mockResolvedValue(manifest);
    superScaffold = jest
      .spyOn(ScaffolderClient.prototype, 'scaffold')
      .mockResolvedValue({ taskId: 'task-1' });
    setInstallation = jest
      .spyOn(DiscoveryApiClient, 'setInstallation')
      .mockReturnValue(() => {});
    client = new ScaffolderApiClient({
      discoveryApi: {} as any,
      identityApi: {} as any,
      scmIntegrationsApi: {} as any,
      fetchApi: {} as any,
      kubernetesApi,
      kubernetesAuthProvidersApi,
    });
  });

  afterEach(() => jest.restoreAllMocks());

  it('routes the task to the field’s installation with a token minted now', async () => {
    getCredentials.mockResolvedValue({ token: 'fresh' });

    await client.scaffold({
      templateRef: 'template:default/app',
      values: { mode: 'apply', token: { oidcTokenInstallation: 'golem' } },
      secrets: { GITHUB_TOKEN: 'gh' },
    });

    expect(getCredentials).toHaveBeenCalledWith('oidc.oidc-golem');
    expect(setInstallation).toHaveBeenCalledWith('golem');
    expect(superScaffold).toHaveBeenCalledWith(
      expect.objectContaining({
        secrets: { GITHUB_TOKEN: 'gh', USER_OIDC_TOKEN: 'fresh' },
      }),
    );
  });

  it('neither mints for nor routes to a value left over from another branch', async () => {
    await client.scaffold({
      templateRef: 'template:default/app',
      values: { mode: 'commit', token: { oidcTokenInstallation: 'golem' } },
    });

    expect(getCredentials).not.toHaveBeenCalled();
    expect(setInstallation).not.toHaveBeenCalled();
    expect(superScaffold).toHaveBeenCalledWith(
      expect.objectContaining({ secrets: {} }),
    );
  });

  it('starts nothing when a sign-in did not complete', async () => {
    getCredentials.mockRejectedValue(
      Object.assign(new Error('Login failed, rejected by user'), {
        name: 'RejectedError',
      }),
    );

    await expect(
      client.scaffold({
        templateRef: 'template:default/app',
        values: { mode: 'apply', token: { oidcTokenInstallation: 'golem' } },
      }),
    ).rejects.toBeInstanceOf(TemplateSignInError);
    expect(superScaffold).not.toHaveBeenCalled();
  });
});
