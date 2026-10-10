import { useCallback, useLayoutEffect, useState } from 'react';
import { UserIdentity } from '@backstage/core-components';
import {
  type ApiRef,
  type BackstageIdentityApi,
  type IdentityApi,
  type ProfileInfoApi,
  type SessionApi,
  useAnalytics,
  useApiHolder,
} from '@backstage/core-plugin-api';
import { useSearchParams } from 'react-router-dom';

/**
 * Where upstream's `SignInPage` remembers the provider the person last signed
 * in with. Shared with it on purpose: a session started on either page is
 * picked up silently by the other, so a deployment switching the Agent
 * Platform on or off signs nobody out.
 */
export const PROVIDER_STORAGE_KEY = '@backstage/core:SignInPage:provider';

/** One sign-in option: the `SignInPage` provider shape. */
export interface ShellSignInProvider {
  id: string;
  title: string;
  message: string;
  apiRef: ApiRef<ProfileInfoApi & BackstageIdentityApi & SessionApi>;
}

type AuthApi = ProfileInfoApi & BackstageIdentityApi & SessionApi;

function readStoredProviderId(): string | null {
  try {
    return localStorage.getItem(PROVIDER_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredProviderId(id: string | undefined) {
  try {
    if (id) {
      localStorage.setItem(PROVIDER_STORAGE_KEY, id);
    } else {
      localStorage.removeItem(PROVIDER_STORAGE_KEY);
    }
  } catch {
    // Storage blocked: sign-in still works, it just is not remembered.
  }
}

async function toIdentity(
  authApi: AuthApi,
  identity: Awaited<ReturnType<AuthApi['getBackstageIdentity']>>,
) {
  if (!identity) {
    return undefined;
  }
  const profile = await authApi.getProfile();
  return UserIdentity.create({
    identity: identity.identity,
    profile,
    authApi,
  });
}

export interface ProviderSignIn {
  /** True while a remembered session is being looked up silently. */
  loading: boolean;
  /** The provider whose sign-in popup is open, if any. */
  pendingId?: string;
  /** Why the last sign-in did not complete. */
  error?: Error;
  signIn(provider: ShellSignInProvider): void;
}

/**
 * The sign-in behaviour of upstream's multi-provider `SignInPage`
 * (`@backstage/core-components`), for a page drawn in the shell's style:
 *
 * - on mount, the provider remembered from the last sign-in is asked for an
 *   existing session without a popup; found, the person is signed in
 *   silently, otherwise the options are shown;
 * - choosing an option remembers it and opens that provider's popup;
 * - signing out forgets the remembered provider;
 * - the `signIn`/`signOut` analytics events are the upstream ones.
 *
 * Unlike upstream, a failed sign-in (or an `?error=` the auth backend
 * redirected back with) is shown on the page instead of in a toast.
 */
export function useProviderSignIn(
  providers: ShellSignInProvider[],
  onSignInSuccess: (identityApi: IdentityApi) => void,
): ProviderSignIn {
  const apis = useApiHolder();
  const analytics = useAnalytics();
  const [searchParams] = useSearchParams();
  const errorParam = searchParams.get('error');
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string>();
  const [error, setError] = useState<Error | undefined>(() =>
    errorParam ? new Error(errorParam) : undefined,
  );

  const succeed = useCallback(
    (identityApi: IdentityApi) => {
      onSignInSuccess({
        getProfileInfo: () => identityApi.getProfileInfo(),
        getBackstageIdentity: () => identityApi.getBackstageIdentity(),
        getCredentials: () => identityApi.getCredentials(),
        signOut: async () => {
          writeStoredProviderId(undefined);
          await identityApi.signOut();
          analytics.captureEvent('signOut', 'success');
        },
      });
      analytics.captureEvent('signIn', 'success');
    },
    [onSignInSuccess, analytics],
  );

  useLayoutEffect(() => {
    if (!loading) {
      return undefined;
    }
    const provider = providers.find(p => p.id === readStoredProviderId());
    const authApi = provider && apis.get(provider.apiRef);
    if (!authApi) {
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    authApi
      .getBackstageIdentity({ optional: true })
      .then(identity => toIdentity(authApi, identity))
      .then(identityApi => {
        if (cancelled) {
          writeStoredProviderId(undefined);
          return;
        }
        if (identityApi) {
          succeed(identityApi);
        } else {
          setLoading(false);
        }
      })
      .catch((e: Error) => {
        writeStoredProviderId(undefined);
        if (!cancelled) {
          setError(e);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [loading, providers, apis, succeed]);

  const signIn = useCallback(
    async (provider: ShellSignInProvider) => {
      const authApi = apis.get(provider.apiRef);
      setError(undefined);
      setPendingId(provider.id);
      writeStoredProviderId(provider.id);
      try {
        if (!authApi) {
          throw new Error(`The ${provider.title} sign-in is not available`);
        }
        const identityApi = await toIdentity(
          authApi,
          await authApi.getBackstageIdentity({ instantPopup: true }),
        );
        if (!identityApi) {
          throw new Error(
            `The ${provider.title} provider is not configured to support sign-in`,
          );
        }
        succeed(identityApi);
      } catch (e) {
        writeStoredProviderId(undefined);
        setError(e as Error);
        setPendingId(undefined);
      }
    },
    [apis, succeed],
  );

  return { loading, pendingId, error, signIn };
}
