import { mockApis } from '@backstage/frontend-test-utils';
import { getOIDCScopes } from './scopes';

const BASE = ['openid', 'profile', 'email', 'groups', 'offline_access'];
const DEX_DEFAULTS = [
  'federated:id',
  'audience:server:client_id:dex-k8s-authenticator',
];

function scopes(data: object) {
  return getOIDCScopes(mockApis.config({ data }));
}

describe('getOIDCScopes', () => {
  it('appends the Dex default extra scopes when nothing is configured', () => {
    expect(scopes({})).toEqual([...BASE, ...DEX_DEFAULTS]);
  });

  it('works without a config api', () => {
    expect(getOIDCScopes()).toEqual([...BASE, ...DEX_DEFAULTS]);
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
