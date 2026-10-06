import type { TemplateParameterSchema } from '@backstage/plugin-scaffolder-common';
import type {
  KubernetesApi,
  KubernetesAuthProvidersApi,
} from '@backstage/plugin-kubernetes-react';
import { ClusterTokenError } from '@giantswarm/backstage-plugin-kubernetes-react';
import { TemplateSignInError } from '../../../apis/scaffolder/TemplateSignInError';
import { mintTemplateTokens, templateTokenFields } from './templateTokens';

function manifest(...schemas: object[]): TemplateParameterSchema {
  return {
    title: 'Template',
    steps: schemas.map((schema, index) => ({
      title: `Step ${index + 1}`,
      schema,
    })),
  } as TemplateParameterSchema;
}

function tokenField(options: object = { secretsKey: 'USER_OIDC_TOKEN' }) {
  return { type: 'object', 'ui:field': 'GSOIDCToken', 'ui:options': options };
}

const token = (installation: string) => ({
  oidcTokenInstallation: installation,
});

describe('templateTokenFields', () => {
  it('reads each field’s own value across steps and nested objects', () => {
    const fields = templateTokenFields(
      manifest(
        {
          type: 'object',
          properties: { token: tokenField({ secretsKey: 'MC_TOKEN' }) },
        },
        {
          type: 'object',
          properties: {
            target: {
              type: 'object',
              properties: { token: tokenField({ secretsKey: 'WC_TOKEN' }) },
            },
          },
        },
      ),
      { token: token('golem'), target: { token: token('gazelle') } },
    );

    expect(fields).toEqual([
      { secretsKey: 'MC_TOKEN', installation: 'golem' },
      { secretsKey: 'WC_TOKEN', installation: 'gazelle' },
    ]);
  });

  it('leaves out a value left over from a branch the entries no longer select', () => {
    const schema = {
      type: 'object',
      properties: { mode: { type: 'string', enum: ['apply', 'commit'] } },
      dependencies: {
        mode: {
          oneOf: [
            {
              properties: { mode: { const: 'apply' }, token: tokenField() },
            },
            { properties: { mode: { const: 'commit' } } },
          ],
        },
      },
    };

    expect(
      templateTokenFields(manifest(schema), {
        mode: 'apply',
        token: token('golem'),
      }),
    ).toEqual([{ secretsKey: 'USER_OIDC_TOKEN', installation: 'golem' }]);
    expect(
      templateTokenFields(manifest(schema), {
        mode: 'commit',
        token: token('golem'),
      }),
    ).toEqual([]);
  });

  it('finds fields in array items', () => {
    expect(
      templateTokenFields(
        manifest({
          type: 'object',
          properties: {
            targets: {
              type: 'array',
              items: {
                type: 'object',
                properties: { token: tokenField() },
              },
            },
          },
        }),
        { targets: [{ token: token('golem') }, { token: token('gazelle') }] },
      ),
    ).toEqual([
      { secretsKey: 'USER_OIDC_TOKEN', installation: 'golem' },
      { secretsKey: 'USER_OIDC_TOKEN', installation: 'gazelle' },
    ]);
  });

  it('follows the oneOf option the entries select', () => {
    const schema = {
      type: 'object',
      properties: {
        target: {
          oneOf: [
            {
              type: 'object',
              properties: {
                kind: { const: 'cluster' },
                token: tokenField(),
              },
              required: ['kind'],
            },
            {
              type: 'object',
              properties: { kind: { const: 'repo' } },
              required: ['kind'],
            },
          ],
        },
      },
    };

    expect(
      templateTokenFields(manifest(schema), {
        target: { kind: 'cluster', token: token('golem') },
      }),
    ).toEqual([{ secretsKey: 'USER_OIDC_TOKEN', installation: 'golem' }]);
    expect(
      templateTokenFields(manifest(schema), {
        target: { kind: 'repo', token: token('golem') },
      }),
    ).toEqual([]);
  });

  it('follows the anyOf option the entries select', () => {
    expect(
      templateTokenFields(
        manifest({
          type: 'object',
          properties: {
            target: {
              anyOf: [
                {
                  type: 'object',
                  properties: { token: tokenField() },
                  required: ['token'],
                },
              ],
            },
          },
        }),
        { target: { token: token('golem') } },
      ),
    ).toEqual([{ secretsKey: 'USER_OIDC_TOKEN', installation: 'golem' }]);
  });

  it('keeps a field without a secrets key and skips one without a value', () => {
    expect(
      templateTokenFields(
        manifest({
          type: 'object',
          properties: {
            routing: tokenField({}),
            unset: tokenField(),
          },
        }),
        { routing: token('golem') },
      ),
    ).toEqual([{ installation: 'golem', secretsKey: undefined }]);
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
    getCluster.mockImplementation(async (name: string) => ({
      authProvider: 'oidc',
      oidcTokenProvider: `oidc-${name}`,
    }));
    getCredentials.mockReset();
  });

  it('mints once per installation and fills every secret that names it', async () => {
    getCredentials.mockImplementation(async (provider: string) => ({
      token: `token-for-${provider}`,
    }));

    await expect(
      mintTemplateTokens(
        [
          { secretsKey: 'MC_TOKEN', installation: 'golem' },
          { secretsKey: 'USER_OIDC_TOKEN', installation: 'golem' },
          { secretsKey: 'WC_TOKEN', installation: 'gazelle' },
          { installation: 'routing-only' },
        ],
        kubernetesApi,
        kubernetesAuthProvidersApi,
      ),
    ).resolves.toEqual({
      MC_TOKEN: 'token-for-oidc.oidc-golem',
      USER_OIDC_TOKEN: 'token-for-oidc.oidc-golem',
      WC_TOKEN: 'token-for-oidc.oidc-gazelle',
    });
    expect(getCluster).toHaveBeenCalledTimes(2);
    expect(getCredentials).toHaveBeenCalledTimes(2);
  });

  it('leaves out an installation whose token fails for a reason other than sign-in', async () => {
    getCluster.mockImplementation(async (name: string) => {
      if (name === 'unknown') return undefined;
      if (name === 'down') throw new Error('kubernetes API unavailable');
      return { authProvider: 'oidc', oidcTokenProvider: `oidc-${name}` };
    });
    getCredentials.mockImplementation(async (provider: string) => {
      if (provider === 'oidc.oidc-broker') {
        throw new ClusterTokenError('broker', 'broker_unreachable');
      }
      return { token: provider === 'oidc.oidc-empty' ? undefined : 'token' };
    });

    await expect(
      mintTemplateTokens(
        [
          { secretsKey: 'A', installation: 'unknown' },
          { secretsKey: 'B', installation: 'empty' },
          { secretsKey: 'C', installation: 'down' },
          { secretsKey: 'D', installation: 'broker' },
          { secretsKey: 'E', installation: 'golem' },
        ],
        kubernetesApi,
        kubernetesAuthProvidersApi,
      ),
    ).resolves.toEqual({ E: 'token' });
  });

  it('rejects with a declined sign-in once every sign-in has settled', async () => {
    const declined = Object.assign(
      new Error('Login failed, rejected by user'),
      { name: 'RejectedError' },
    );
    let completeGazelle: (value: { token: string }) => void = () => {};
    getCredentials.mockImplementation((provider: string) =>
      provider === 'oidc.oidc-golem'
        ? Promise.reject(declined)
        : new Promise(resolve => {
            completeGazelle = resolve;
          }),
    );

    let settled = false;
    const minting = mintTemplateTokens(
      [
        { secretsKey: 'A', installation: 'golem' },
        { secretsKey: 'B', installation: 'gazelle' },
      ],
      kubernetesApi,
      kubernetesAuthProvidersApi,
    ).finally(() => {
      settled = true;
    });
    minting.catch(() => {});

    await new Promise(resolve => setTimeout(resolve, 0));
    expect(settled).toBe(false);

    completeGazelle({ token: 'gazelle-token' });
    const error = await minting.then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(TemplateSignInError);
    expect(error).toMatchObject({
      reason: 'declined',
      installations: ['golem'],
      cause: declined,
    });
  });

  it('reports an expired session over a declined sign-in', async () => {
    getCredentials.mockImplementation(async (provider: string) => {
      if (provider === 'oidc.oidc-golem') {
        throw new ClusterTokenError('golem', 'session-expired');
      }
      throw new Error('Login failed, popup was closed');
    });

    await expect(
      mintTemplateTokens(
        [
          { secretsKey: 'A', installation: 'golem' },
          { secretsKey: 'B', installation: 'gazelle' },
        ],
        kubernetesApi,
        kubernetesAuthProvidersApi,
      ),
    ).rejects.toMatchObject({
      name: 'TemplateSignInError',
      reason: 'session-expired',
      installations: ['golem'],
    });
  });
});
