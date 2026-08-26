import { mockApis } from '@backstage/frontend-test-utils';
import { getOIDCScopes } from './scopes';

const DEX_DEFAULTS = [
  'federated:id',
  'audience:server:client_id:dex-k8s-authenticator',
];

const BASE = ['openid', 'profile', 'email', 'groups', 'offline_access'];

function scopes(data: object, defaultExtraScopes = DEX_DEFAULTS) {
  return getOIDCScopes(mockApis.config({ data }), defaultExtraScopes);
}

describe('getOIDCScopes', () => {
  it('appends the default extra scopes when nothing is configured', () => {
    expect(scopes({})).toEqual([...BASE, ...DEX_DEFAULTS]);
  });

  it('works without a config api', () => {
    expect(getOIDCScopes(undefined, DEX_DEFAULTS)).toEqual([
      ...BASE,
      ...DEX_DEFAULTS,
    ]);
  });

  it('drops every extra scope when gs.auth.extraScopes is empty', () => {
    expect(scopes({ gs: { auth: { extraScopes: [] } } })).toEqual(BASE);
  });

  it('replaces the default extra scopes with the configured ones', () => {
    expect(
      scopes({ gs: { auth: { extraScopes: ['roles', 'organization'] } } }),
    ).toEqual([...BASE, 'roles', 'organization']);
  });

  it('does not repeat a scope already in the base set', () => {
    expect(
      scopes({ gs: { auth: { extraScopes: ['groups', 'roles'] } } }),
    ).toEqual([...BASE, 'roles']);
  });
});
