import { mockApis } from '@backstage/frontend-test-utils';
import { getOIDCScopes } from './scopes';

const BASE = ['openid', 'profile', 'email', 'groups', 'offline_access'];
const DEX_AUDIENCE = 'audience:server:client_id:dex-k8s-authenticator';

function scopes(providerKind: 'kubernetes' | 'mcp', data: object) {
  return getOIDCScopes(providerKind, mockApis.config({ data }));
}

describe('getOIDCScopes', () => {
  it('appends the Dex default extra scopes for a kubernetes provider', () => {
    expect(scopes('kubernetes', {})).toEqual([
      ...BASE,
      'federated:id',
      DEX_AUDIENCE,
    ]);
  });

  it('leaves federated:id out for an mcp provider', () => {
    expect(scopes('mcp', {})).toEqual([...BASE, DEX_AUDIENCE]);
  });

  it('works without a config api', () => {
    expect(getOIDCScopes('kubernetes')).toEqual([
      ...BASE,
      'federated:id',
      DEX_AUDIENCE,
    ]);
  });

  it('drops every extra scope when gs.auth.extraScopes is empty', () => {
    const data = { gs: { auth: { extraScopes: [] } } };

    expect(scopes('kubernetes', data)).toEqual(BASE);
    expect(scopes('mcp', data)).toEqual(BASE);
  });

  it('replaces the default extra scopes with the configured ones', () => {
    const data = { gs: { auth: { extraScopes: ['roles', 'organization'] } } };

    expect(scopes('kubernetes', data)).toEqual([
      ...BASE,
      'roles',
      'organization',
    ]);
    expect(scopes('mcp', data)).toEqual([...BASE, 'roles', 'organization']);
  });

  it('does not repeat a scope already in the base set', () => {
    expect(
      scopes('kubernetes', {
        gs: { auth: { extraScopes: ['groups', 'roles'] } },
      }),
    ).toEqual([...BASE, 'roles']);
  });
});
