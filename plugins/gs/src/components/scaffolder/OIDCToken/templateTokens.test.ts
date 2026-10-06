import type { TemplateParameterSchema } from '@backstage/plugin-scaffolder-common';
import type {
  KubernetesApi,
  KubernetesAuthProvidersApi,
} from '@backstage/plugin-kubernetes-react';
import { mintTemplateTokens, templateTokens } from './templateTokens';

function manifest(...schemas: object[]): TemplateParameterSchema {
  return {
    title: 'Template',
    steps: schemas.map((schema, index) => ({
      title: `Step ${index + 1}`,
      schema,
    })),
  } as TemplateParameterSchema;
}

function tokenField(options: object) {
  return { type: 'object', 'ui:field': 'GSOIDCToken', 'ui:options': options };
}

describe('templateTokens', () => {
  it('finds token fields across steps and nested objects', () => {
    const tokens = templateTokens(
      manifest(
        {
          type: 'object',
          properties: {
            installation: { type: 'string' },
            token: tokenField({
              secretsKey: 'MC_TOKEN',
              installationName: 'golem',
            }),
          },
        },
        {
          type: 'object',
          properties: {
            target: {
              type: 'object',
              properties: {
                token: tokenField({
                  secretsKey: 'WC_TOKEN',
                  installationNameField: 'installation',
                }),
              },
            },
          },
        },
      ),
      { installation: 'gazelle' },
    );

    expect(tokens).toEqual([
      { secretsKey: 'MC_TOKEN', installation: 'golem' },
      { secretsKey: 'WC_TOKEN', installation: 'gazelle' },
    ]);
  });

  it('leaves out a token field in a branch the entries no longer select', () => {
    const schema = {
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
                token: tokenField({
                  secretsKey: 'USER_OIDC_TOKEN',
                  installationName: 'golem',
                }),
              },
            },
            { properties: { mode: { const: 'commit' } } },
          ],
        },
      },
    };

    expect(templateTokens(manifest(schema), { mode: 'apply' })).toEqual([
      { secretsKey: 'USER_OIDC_TOKEN', installation: 'golem' },
    ]);
    expect(
      templateTokens(manifest(schema), {
        mode: 'commit',
        token: { oidcTokenInstallation: 'golem' },
      }),
    ).toEqual([]);
  });

  it('needs no token for a field without a secrets key or an installation', () => {
    expect(
      templateTokens(
        manifest({
          type: 'object',
          properties: {
            noKey: tokenField({ installationName: 'golem' }),
            noInstallation: tokenField({
              secretsKey: 'TOKEN',
              installationNameField: 'installation',
            }),
          },
        }),
        {},
      ),
    ).toEqual([]);
  });
});

describe('mintTemplateTokens', () => {
  const getCluster = jest.fn();
  const getCredentials = jest.fn();
  const kubernetesApi = { getCluster } as unknown as KubernetesApi;
  const kubernetesAuthProvidersApi = {
    getCredentials,
  } as unknown as KubernetesAuthProvidersApi;

  beforeEach(() => {
    getCluster.mockReset();
    getCredentials.mockReset();
  });

  it('mints a token per installation', async () => {
    getCluster.mockImplementation(async (name: string) => ({
      authProvider: 'oidc',
      oidcTokenProvider: `oidc-${name}`,
    }));
    getCredentials.mockImplementation(async (provider: string) => ({
      token: `token-for-${provider}`,
    }));

    await expect(
      mintTemplateTokens(
        [
          { secretsKey: 'A', installation: 'golem' },
          { secretsKey: 'B', installation: 'gazelle' },
        ],
        kubernetesApi,
        kubernetesAuthProvidersApi,
      ),
    ).resolves.toEqual({
      A: 'token-for-oidc.oidc-golem',
      B: 'token-for-oidc.oidc-gazelle',
    });
  });

  it('leaves out an installation it cannot mint for without a sign-in', async () => {
    getCluster.mockImplementation(async (name: string) =>
      name === 'unknown'
        ? undefined
        : { authProvider: 'oidc', oidcTokenProvider: `oidc-${name}` },
    );
    getCredentials.mockImplementation(async (provider: string) => ({
      token: provider === 'oidc.oidc-empty' ? undefined : 'token',
    }));

    await expect(
      mintTemplateTokens(
        [
          { secretsKey: 'A', installation: 'unknown' },
          { secretsKey: 'B', installation: 'empty' },
          { secretsKey: 'C', installation: 'golem' },
        ],
        kubernetesApi,
        kubernetesAuthProvidersApi,
      ),
    ).resolves.toEqual({ C: 'token' });
  });

  it('rejects when the sign-in is declined', async () => {
    const declined = Object.assign(
      new Error('Login failed, rejected by user'),
      {
        name: 'RejectedError',
      },
    );
    getCluster.mockResolvedValue({
      authProvider: 'oidc',
      oidcTokenProvider: 'oidc-golem',
    });
    getCredentials.mockRejectedValue(declined);

    await expect(
      mintTemplateTokens(
        [{ secretsKey: 'A', installation: 'golem' }],
        kubernetesApi,
        kubernetesAuthProvidersApi,
      ),
    ).rejects.toBe(declined);
  });
});
