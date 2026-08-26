import { mockApis } from '@backstage/frontend-test-utils';
import {
  DEFAULT_KUBERNETES_EXTRA_SCOPES,
  DEFAULT_MCP_EXTRA_SCOPES,
  resolveOIDCScopes,
} from './scopes';

function resolve(data: object, providerName = 'oidc-main') {
  return resolveOIDCScopes({
    configApi: mockApis.config({ data }),
    providerName,
    defaultExtraScopes: DEFAULT_KUBERNETES_EXTRA_SCOPES,
  });
}

describe('resolveOIDCScopes', () => {
  it('appends the default extra scopes when nothing is configured', () => {
    expect(resolve({})).toEqual([
      'openid',
      'profile',
      'email',
      'groups',
      'offline_access',
      'federated:id',
      'audience:server:client_id:dex-k8s-authenticator',
    ]);
  });

  it('works without a config api', () => {
    expect(
      resolveOIDCScopes({
        providerName: 'oidc-main',
        defaultExtraScopes: DEFAULT_MCP_EXTRA_SCOPES,
      }),
    ).toEqual([
      'openid',
      'profile',
      'email',
      'groups',
      'offline_access',
      'audience:server:client_id:dex-k8s-authenticator',
    ]);
  });

  it('drops every extra scope when gs.auth.extraScopes is empty', () => {
    expect(resolve({ gs: { auth: { extraScopes: [] } } })).toEqual([
      'openid',
      'profile',
      'email',
      'groups',
      'offline_access',
    ]);
  });

  it('replaces the default extra scopes with the configured ones', () => {
    expect(
      resolve({ gs: { auth: { extraScopes: ['roles', 'organization'] } } }),
    ).toEqual([
      'openid',
      'profile',
      'email',
      'groups',
      'offline_access',
      'roles',
      'organization',
    ]);
  });

  it('prefers the per-provider entry over the shared one', () => {
    const data = {
      gs: {
        auth: {
          extraScopes: ['roles'],
          providers: {
            'oidc-main': { extraScopes: ['federated:id'] },
          },
        },
      },
    };

    expect(resolve(data, 'oidc-main')).toEqual([
      'openid',
      'profile',
      'email',
      'groups',
      'offline_access',
      'federated:id',
    ]);
    expect(resolve(data, 'mcp-example')).toEqual([
      'openid',
      'profile',
      'email',
      'groups',
      'offline_access',
      'roles',
    ]);
  });

  it('lets a per-provider empty list override a shared non-empty one', () => {
    expect(
      resolve({
        gs: {
          auth: {
            extraScopes: ['federated:id'],
            providers: { 'oidc-main': { extraScopes: [] } },
          },
        },
      }),
    ).toEqual(['openid', 'profile', 'email', 'groups', 'offline_access']);
  });

  it('does not repeat a scope already in the base set', () => {
    expect(
      resolve({ gs: { auth: { extraScopes: ['groups', 'roles'] } } }),
    ).toEqual([
      'openid',
      'profile',
      'email',
      'groups',
      'offline_access',
      'roles',
    ]);
  });
});
