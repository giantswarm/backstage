import { mockApis } from '@backstage/frontend-test-utils';
import { getOIDCScopes } from './scopes';

const BASE = ['openid', 'profile', 'email', 'groups', 'offline_access'];

function scopes(data: object) {
  return getOIDCScopes(mockApis.config({ data }));
}

describe('getOIDCScopes', () => {
  it('requests the base scopes when gs.auth.extraScopes is unset', () => {
    expect(scopes({})).toEqual(BASE);
  });

  it('works without a config api', () => {
    expect(getOIDCScopes()).toEqual(BASE);
  });

  it('requests the base scopes when gs.auth.extraScopes is empty', () => {
    expect(scopes({ gs: { auth: { extraScopes: [] } } })).toEqual(BASE);
  });

  it('appends the configured extra scopes', () => {
    expect(
      scopes({
        gs: {
          auth: {
            extraScopes: [
              'federated:id',
              'audience:server:client_id:dex-k8s-authenticator',
            ],
          },
        },
      }),
    ).toEqual([
      ...BASE,
      'federated:id',
      'audience:server:client_id:dex-k8s-authenticator',
    ]);
  });

  it('does not repeat a scope already in the base set', () => {
    expect(
      scopes({ gs: { auth: { extraScopes: ['groups', 'roles'] } } }),
    ).toEqual([...BASE, 'roles']);
  });
});
