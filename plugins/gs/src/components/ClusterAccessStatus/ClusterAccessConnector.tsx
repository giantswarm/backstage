import { useEffect } from 'react';
import { useApi, SessionState } from '@backstage/core-plugin-api';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { gsAuthProvidersApiRef } from '../../apis/auth';
import { ClusterTokenError } from '../../apis/auth/DefaultAuthConnector';
import { clusterAccessStatusApiRef } from '../../apis/clusterAccessStatus';
import { useMutedInstallations } from '../../apis/mutedInstallations';
import { KubernetesClient } from '../../apis/kubernetes';

function assertNever(value: never): never {
  throw new Error(`Unhandled probe outcome: ${JSON.stringify(value)}`);
}

/**
 * Cheap, broadly-authorized apiserver endpoint used as a liveness probe. It is
 * served to any authenticated request, so a 2xx means both the broker token
 * mint and the apiserver round-trip succeeded.
 */
const HEALTH_PROBE_PATH = '/version';

/**
 * Per-probe timeout, deliberately shorter than the default proxy timeout. The
 * warm-up probes the whole fleet, so an unreachable cluster must release its
 * concurrency slot quickly instead of holding it for the full default (~10s)
 * and dominating the tail. A genuinely slow-but-healthy cluster recovers via
 * the retry/backoff loop and the refresh interval.
 */
const PROBE_TIMEOUT_MS = 2000;

/**
 * Re-probe interval. Keeps the sidebar live (a recovered or newly-broken
 * cluster updates without visiting the clusters page) and keeps broker tokens
 * warm. Cheap because the proxy bounds concurrency.
 */
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 1000;

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function describeProbeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/timed out/i.test(message)) {
    return 'API unreachable (timeout)';
  }
  return message || 'Cluster access failed';
}

function describeHttpError(status: number): string {
  if (status === 401 || status === 403) {
    return 'Access forbidden';
  }
  if (status === 404) {
    return 'API not found';
  }
  return `API request failed (${status})`;
}

/**
 * What to do with a single probe result. `skip` means another layer (the
 * cluster token provider) already recorded the precise state and we must not
 * overwrite it.
 */
export type ProbeOutcome =
  | { kind: 'healthy' }
  | { kind: 'degraded'; reason: string }
  | { kind: 'retry' }
  | { kind: 'skip' };

/** Maps a probe HTTP response to an outcome. 5xx is retried while attempts remain. */
export function classifyProbeResponse(
  response: Pick<Response, 'ok' | 'status'>,
  attempt: number,
  maxRetries: number,
): ProbeOutcome {
  if (response.ok) {
    return { kind: 'healthy' };
  }
  if (response.status >= 500 && attempt < maxRetries) {
    return { kind: 'retry' };
  }
  return { kind: 'degraded', reason: describeHttpError(response.status) };
}

/**
 * Maps a thrown probe error to an outcome. A broker token mint failure
 * (`ClusterTokenError`) was already recorded with its precise state, so it is
 * skipped; transient apiserver/network errors are retried while attempts remain.
 */
export function classifyProbeError(
  error: unknown,
  attempt: number,
  maxRetries: number,
): ProbeOutcome {
  if (error instanceof ClusterTokenError) {
    return { kind: 'skip' };
  }
  if (attempt < maxRetries) {
    return { kind: 'retry' };
  }
  return { kind: 'degraded', reason: describeProbeError(error) };
}

/**
 * Headless component that proactively establishes cluster access for every
 * broker-covered installation, regardless of which page the user is on. It
 * runs once on app load (and on a slow refresh interval), seeding the sidebar
 * cluster-access status with every installation so the status element is
 * visible immediately, then probing each cluster's apiserver to surface real
 * health. Only broker-covered installations are probed, so this never triggers
 * a per-cluster login popup.
 *
 * Non-broker installations (per-cluster OIDC popup logins) can't be probed for
 * the same reason, so they are instead surfaced by mirroring their auth session
 * state: they appear while the user is signed in and drop off on sign-out.
 * Renders nothing.
 */
export function ClusterAccessConnector() {
  const kubernetesApi = useApi(kubernetesApiRef);
  const authProvidersApi = useApi(gsAuthProvidersApiRef);
  const statusApi = useApi(clusterAccessStatusApiRef);

  // Track the user's muted set reactively so muting/unmuting re-runs the probe
  // effects (a muted installation must stop being probed and drop off the status
  // set; unmuting must resume probing). `useMutedInstallations` returns a stable
  // reference that only changes when the contents change, so the initial replay
  // doesn't spuriously re-run these effects and restart the fleet probe.
  const muted = useMutedInstallations();

  useEffect(() => {
    const mutedSet = new Set(muted);
    // Drop any muted installation from the status set — it may have been probed
    // and recorded before being muted, and it must not linger in the widget as
    // healthy/degraded once switched off.
    for (const installation of muted) {
      statusApi.remove(installation);
    }

    const installations = authProvidersApi
      .getBrokerCoveredInstallations()
      .filter(installation => !mutedSet.has(installation));
    if (installations.length === 0) {
      return undefined;
    }

    let cancelled = false;
    // Installations with a probe loop (including its retry backoff) still
    // running, so a refresh tick never stacks a second loop on the same one.
    const inFlight = new Set<string>();

    // Seed once so the sidebar lists every covered installation immediately,
    // before any probe settles. Re-probes (interval) intentionally do not
    // reset entries to "connecting", to avoid flicker.
    for (const installation of installations) {
      statusApi.recordConnecting(installation);
    }

    const apply = (installation: string, outcome: ProbeOutcome): boolean => {
      switch (outcome.kind) {
        case 'healthy':
          statusApi.recordHealthy(installation);
          return true;
        case 'degraded':
          statusApi.recordDegraded(installation, outcome.reason);
          return true;
        case 'skip':
          return true;
        case 'retry':
          return false;
        default:
          return assertNever(outcome);
      }
    };

    const probe = async (installation: string) => {
      if (inFlight.has(installation)) {
        return;
      }
      inFlight.add(installation);
      try {
        for (let attempt = 0; ; attempt++) {
          if (cancelled) {
            return;
          }
          let outcome: ProbeOutcome;
          try {
            // Background warm-up: yields to foreground page reads and uses a
            // short timeout so an unreachable cluster does not hold a slot.
            const response = await kubernetesApi.proxy({
              clusterName: installation,
              path: HEALTH_PROBE_PATH,
              background: true,
              timeoutMs: PROBE_TIMEOUT_MS,
            } as Parameters<KubernetesClient['proxy']>[0]);
            outcome = classifyProbeResponse(response, attempt, MAX_RETRIES);
          } catch (error) {
            outcome = classifyProbeError(error, attempt, MAX_RETRIES);
          }
          if (cancelled) {
            return;
          }
          // A retry with capped backoff is what lets an initial-storm timeout
          // resolve on its own instead of sticking as degraded.
          if (!apply(installation, outcome)) {
            await delay(RETRY_BASE_DELAY_MS * 2 ** attempt);
            continue;
          }
          return;
        }
      } finally {
        inFlight.delete(installation);
      }
    };

    const connectAll = () => {
      installations.forEach(installation => {
        probe(installation);
      });
    };

    connectAll();
    const interval = setInterval(connectAll, REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [kubernetesApi, authProvidersApi, statusApi, muted]);

  // Non-broker installations can't be probed proactively: a proxy call on one
  // without a live session would pop up a per-cluster login. So instead of
  // probing apiserver health, we mirror their auth session state -- an
  // installation the user is signed in to shows up as accessible and drops off
  // the widget when signed out. This is the "different logic" from the broker
  // path above, which probes real apiserver health.
  useEffect(() => {
    const mutedSet = new Set(muted);
    // A muted non-broker installation must also drop off the status set.
    for (const installation of muted) {
      statusApi.remove(installation);
    }

    const kubernetesAuthApis = authProvidersApi.getKubernetesAuthApis();
    const brokerCovered = new Set(
      authProvidersApi.getBrokerCoveredInstallations(),
    );
    // getProviders() already excludes broker-covered installations; the
    // kubernetesAuthApis check drops MCP providers, the brokerCovered guard is
    // belt-and-suspenders so the two paths never both own an installation, and
    // muted installations are switched off app-wide.
    const nonBrokerProviders = authProvidersApi
      .getProviders()
      .filter(
        provider =>
          Boolean(kubernetesAuthApis[provider.providerName]) &&
          !brokerCovered.has(provider.installationName) &&
          !mutedSet.has(provider.installationName),
      );

    const subscriptions = nonBrokerProviders.map(provider =>
      kubernetesAuthApis[provider.providerName]
        .sessionState$()
        .subscribe(sessionState => {
          if (sessionState === SessionState.SignedIn) {
            statusApi.recordHealthy(provider.installationName);
          } else {
            // SignedOut -- no live session, so it is no longer accessed.
            statusApi.remove(provider.installationName);
          }
        }),
    );

    return () => {
      subscriptions.forEach(subscription => subscription.unsubscribe());
    };
  }, [authProvidersApi, statusApi, muted]);

  return null;
}
