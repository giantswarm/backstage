import type { PropsWithChildren } from 'react';
import { act, renderHook } from '@testing-library/react';
import { TestApiProvider } from '@backstage/frontend-test-utils';
import { openLoginPopup } from '@backstage/core-app-api';
import { ConfigApi, OAuthRequestApi } from '@backstage/core-plugin-api';
import { GSAuthProviders } from './GSAuthProviders';
import {
  MainSessionEndStore,
  sessionEndReasonOf,
  useMainSessionEnd,
} from './mainSessionEnd';
import { gsAuthProvidersApiRef } from './types';
import { DiscoveryApiClient } from '../discovery/DiscoveryApiClient';

jest.mock('@backstage/core-app-api', () => ({
  ...jest.requireActual('@backstage/core-app-api'),
  openLoginPopup: jest.fn(),
}));

const CLAIMED =
  'Refresh failed; caused by OPError: invalid_grant (Refresh token is invalid or has already been claimed by another client.)';

const scope = 'openid profile email groups offline_access';

function session(expiresInSeconds: number) {
  return {
    providerInfo: {
      idToken: 'dex-id-token',
      accessToken: 'dex-access-token',
      scope,
      expiresInSeconds,
    },
  };
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('sessionEndReasonOf', () => {
  it('reads a claimed refresh token as a sign-in elsewhere', () => {
    expect(sessionEndReasonOf(401, { error: { message: CLAIMED } })).toBe(
      'signed-in-elsewhere',
    );
  });

  it.each([
    [401, { error: { message: 'Refresh failed; caused by fetch failed' } }],
    [401, undefined],
    [401, { error: 'already been claimed by another client' }],
    [503, { error: { message: CLAIMED } }],
  ])('reads nothing into %s %j', (status, body) => {
    expect(sessionEndReasonOf(status, body)).toBeUndefined();
  });
});

describe('the main sign-in session end', () => {
  // The Login Required dialog, confirmed at once.
  const oauthRequestApi = {
    createAuthRequester: jest.fn(
      ({ onAuthRequest }: { onAuthRequest: (s: Set<string>) => unknown }) =>
        (scopes: Set<string>) =>
          onAuthRequest(scopes),
    ),
    authRequest$: jest.fn(),
  } as unknown as OAuthRequestApi;

  const configApi = {
    getOptionalString: jest.fn((key: string) =>
      key === 'gs.authProvider' ? 'oidc-gazelle' : undefined,
    ),
    getOptionalConfig: jest.fn().mockReturnValue(undefined),
    getOptionalStringArray: jest.fn().mockReturnValue(undefined),
    getString: jest.fn().mockReturnValue('http://backend'),
    getOptionalBoolean: jest.fn().mockReturnValue(false),
  } as unknown as ConfigApi;

  const discoveryApi = {
    getBaseUrl: jest.fn().mockResolvedValue('http://backend/api/auth'),
  } as unknown as DiscoveryApiClient;

  let refreshAnswer: () => Response;

  beforeEach(() => {
    window.localStorage.clear();
    (openLoginPopup as jest.Mock).mockReset();
    (openLoginPopup as jest.Mock).mockResolvedValue(session(3600));
    jest.spyOn(global, 'fetch').mockImplementation(async () => refreshAnswer());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function signedInProviders() {
    const providers = GSAuthProviders.create({
      configApi,
      discoveryApi,
      oauthRequestApi,
    });
    // Short-lived, so the next read refreshes it.
    refreshAnswer = () => jsonResponse(200, session(60));
    return providers;
  }

  it('records a sign-in elsewhere when the refresh token was claimed, until the next sign-in', async () => {
    const providers = signedInProviders();
    const mainAuthApi = providers.getMainAuthApi();
    await mainAuthApi.getIdToken({ optional: true });
    expect(providers.getMainSessionEnd().reason()).toBeUndefined();

    refreshAnswer = () => jsonResponse(401, { error: { message: CLAIMED } });
    await expect(
      mainAuthApi.getIdToken({ optional: true }),
    ).resolves.toBeFalsy();
    expect(providers.getMainSessionEnd().reason()).toBe('signed-in-elsewhere');

    await mainAuthApi.getIdToken();
    expect(openLoginPopup).toHaveBeenCalledTimes(1);
    expect(providers.getMainSessionEnd().reason()).toBeUndefined();
  });

  it('records a sign-in elsewhere when the sign-in page restores a claimed session', async () => {
    const providers = GSAuthProviders.create({
      configApi,
      discoveryApi,
      oauthRequestApi,
    });
    refreshAnswer = () => jsonResponse(401, { error: { message: CLAIMED } });

    await expect(
      providers.getMainAuthApi().getBackstageIdentity({ optional: true }),
    ).resolves.toBeUndefined();

    expect(providers.getMainSessionEnd().reason()).toBe('signed-in-elsewhere');
    expect(openLoginPopup).not.toHaveBeenCalled();
  });

  it('records nothing when the refresh failed otherwise', async () => {
    const providers = signedInProviders();
    const mainAuthApi = providers.getMainAuthApi();
    await mainAuthApi.getIdToken({ optional: true });

    refreshAnswer = () =>
      jsonResponse(401, {
        error: { message: 'Refresh failed; caused by RPError: fetch failed' },
      });
    await mainAuthApi.getIdToken({ optional: true });

    expect(providers.getMainSessionEnd().reason()).toBeUndefined();
  });
});

describe('useMainSessionEnd', () => {
  it('follows the store', () => {
    const store = new MainSessionEndStore();
    const wrapper = ({ children }: PropsWithChildren<{}>) => (
      <TestApiProvider
        apis={[[gsAuthProvidersApiRef, { getMainSessionEnd: () => store }]]}
      >
        {children}
      </TestApiProvider>
    );
    const { result } = renderHook(() => useMainSessionEnd(), { wrapper });
    expect(result.current).toBeUndefined();

    act(() => store.record('signed-in-elsewhere'));
    expect(result.current).toBe('signed-in-elsewhere');

    act(() => store.clear());
    expect(result.current).toBeUndefined();
  });

  it('is undefined where the app has no auth providers API', () => {
    const { result } = renderHook(() => useMainSessionEnd(), {
      wrapper: ({ children }: PropsWithChildren<{}>) => (
        <TestApiProvider apis={[]}>{children}</TestApiProvider>
      ),
    });
    expect(result.current).toBeUndefined();
  });
});
