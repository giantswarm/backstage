import { ApiRef, configApiRef } from '@backstage/core-plugin-api';
import type { ApiHolder } from '@backstage/frontend-plugin-api';
import { mockApis } from '@backstage/frontend-test-utils';
import { gsAuthProvidersApiRef } from '@giantswarm/backstage-plugin-gs';
import { hasGithubLogin } from './hasGithubLogin';

function apis({
  config = {},
  musterGrant = false,
}: {
  config?: object;
  musterGrant?: boolean;
}): ApiHolder {
  const implementations = new Map<string, unknown>([
    [configApiRef.id, mockApis.config({ data: config })],
    [gsAuthProvidersApiRef.id, { hasGithubAuthApi: () => musterGrant }],
  ]);
  return {
    get: <T>(ref: ApiRef<T>) => implementations.get(ref.id) as T | undefined,
  };
}

describe('hasGithubLogin', () => {
  it('holds with the GitHub grant in muster (gs.github)', () => {
    expect(hasGithubLogin(apis({ musterGrant: true }))).toBe(true);
  });

  it("holds with Backstage's own GitHub provider", () => {
    // What the public config carries of `auth.providers.github`: the key,
    // its client credentials filtered out by their visibility.
    expect(
      hasGithubLogin(apis({ config: { auth: { providers: { github: {} } } } })),
    ).toBe(true);
  });

  it('fails on a portal with neither', () => {
    // A customer portal: a Dex sign-in, no muster grant, no GitHub provider.
    expect(
      hasGithubLogin(
        apis({
          config: {
            auth: { environment: 'production', providers: {} },
            gs: { authProvider: 'oidc-dex' },
          },
        }),
      ),
    ).toBe(false);
  });

  it('fails when the auth providers API is not registered', () => {
    const configOnly: ApiHolder = {
      get: <T>(ref: ApiRef<T>) =>
        (ref.id === configApiRef.id
          ? mockApis.config({ data: {} })
          : undefined) as T | undefined,
    };
    expect(hasGithubLogin(configOnly)).toBe(false);
  });
});
