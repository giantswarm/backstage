import { useEffect } from 'react';
import {
  discoveryApiRef,
  errorApiRef,
  fetchApiRef,
  identityApiRef,
  useApi,
} from '@backstage/core-plugin-api';
import {
  InstallationsConfigResponse,
  normalizeInstallationsConfig,
  setInstallationsConfig,
} from '../../apis/installations';

const MAX_ATTEMPTS = 5;
const RETRY_BASE_DELAY_MS = 1000;

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Headless loader that fetches the installations config once, after the user
 * signs in, from the authenticated `GET /api/gs/installations` endpoint and
 * publishes it into the module-level source (`installationsConfig.ts`).
 *
 * `identityApi.getCredentials()` blocks until the app-wide sign-in completes
 * (the `AppIdentityProxy` resolves its target only once `SignInPage` calls
 * `onSignInSuccess`), so awaiting it is what defers the fetch until after the
 * main Dex sign-in -- no per-installation OIDC/config is needed to sign in, and
 * `backend.baseUrl` (used to reach this endpoint) does not depend on
 * installations, so there is no chicken-and-egg problem.
 *
 * Renders nothing. Mounted once, high in the app tree.
 */
export function InstallationsConfigLoader() {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const identityApi = useApi(identityApiRef);
  const errorApi = useApi(errorApiRef);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        // Blocks until the app is signed in, so the authenticated endpoint does
        // not 401. Kept inside the try/catch alongside base-URL discovery so a
        // rejection here can never leave the installations promise unresolved
        // (every awaiting boot-time API would otherwise deadlock).
        await identityApi.getCredentials();
        if (cancelled) {
          return;
        }

        const baseUrl = await discoveryApi.getBaseUrl('gs');

        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
          if (cancelled) {
            return;
          }
          try {
            const response = await fetchApi.fetch(`${baseUrl}/installations`);
            if (!response.ok) {
              throw new Error(
                `Failed to load installations config: HTTP ${response.status}`,
              );
            }
            const data = (await response.json()) as InstallationsConfigResponse;
            if (!cancelled) {
              setInstallationsConfig(normalizeInstallationsConfig(data));
            }
            return;
          } catch (error) {
            if (attempt < MAX_ATTEMPTS - 1) {
              await delay(RETRY_BASE_DELAY_MS * 2 ** attempt);
              continue;
            }
            // Retries exhausted -- hand off to the outer catch, which publishes
            // an empty set and reports the failure.
            throw error;
          }
        }
      } catch (error) {
        // Any failure (sign-in credentials, base-URL discovery, or exhausted
        // fetch retries) degrades to "no installations". Publish first, before
        // anything that might throw (errorApi.post), so awaiting boot-time APIs
        // always unblock rather than hanging forever.
        if (!cancelled) {
          setInstallationsConfig([]);
        }
        errorApi.post(error as Error);
      }
    };

    // load() handles its own failures, but guard the invocation too so an
    // unexpected rejection (e.g. errorApi.post itself throwing) can never become
    // an unhandled rejection that leaves the installations promise unresolved.
    load().catch(() => {
      if (!cancelled) {
        setInstallationsConfig([]);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [discoveryApi, fetchApi, identityApi, errorApi]);

  return null;
}
