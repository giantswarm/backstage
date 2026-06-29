import { useCallback, useState } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { musterApiRef } from '../../apis';
import { useMusterInstance } from './MusterInstanceProvider';

export type MusterSession = {
  /** True once muster doesn't require auth, or a probe call succeeds. */
  authenticated: boolean;
  /** Whether a connect (sign-in) round-trip is in flight. */
  connecting: boolean;
  /** Trigger the OAuth popup for the active installation, then re-probe. */
  connect: () => Promise<void>;
};

/**
 * Resolves whether the browsing user has an authenticated muster session for
 * the active installation, and exposes a connect action. A single lightweight
 * `filter_tools(limit=1)` probe doubles as the auth check (a 401/403 flips
 * `authenticated` to false). Shared by every surface that gates muster
 * mutations/tools so they agree on session state (ADR D3) -- the probe is keyed
 * per installation so react-query dedupes it across pages.
 */
export function useMusterSession(): MusterSession {
  const { activeInstallation, activeInstallationInfo } = useMusterInstance();
  const musterApi = useApi(musterApiRef);
  const requiresAuth = activeInstallationInfo?.requiresAuth ?? false;

  const {
    data: probe,
    isError: probeFailed,
    refetch,
  } = useQuery({
    queryKey: ['muster', 'overview', activeInstallation],
    queryFn: () =>
      musterApi.filterTools({ installation: activeInstallation, limit: 1 }),
    enabled: Boolean(activeInstallation),
  });

  const authenticated = !requiresAuth || (!probeFailed && Boolean(probe));

  const [connecting, setConnecting] = useState(false);
  const connect = useCallback(async () => {
    setConnecting(true);
    try {
      await musterApi.signIn(activeInstallation);
      await refetch();
    } finally {
      setConnecting(false);
    }
  }, [musterApi, activeInstallation, refetch]);

  return { authenticated, connecting, connect };
}
