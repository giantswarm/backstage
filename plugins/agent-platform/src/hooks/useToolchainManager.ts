import { useMemo } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import {
  applyInstallationScope,
  useInstallationInventory,
  useInstallationScope,
} from '@giantswarm/backstage-plugin-gs';

import { ToolchainManagerClient } from '../apis/ToolchainManagerClient';
import {
  musterToolchainQueryKey,
  musterToolchainSourcesQueryKey,
  musterToolchainsQueryKey,
} from '../lib/queryKeys';
import {
  TOOLCHAIN_MANAGER_SERVER,
  type ToolchainList,
} from '../lib/toolchainManager';
import { useMusterPluginApi } from './useMusterPluginApi';
import { useMusterServerAvailability } from '@giantswarm/backstage-plugin-muster';

/**
 * The toolchain-manager's tools on one installation, as the signed-in person —
 * `undefined` without the muster plugin (the only way to reach it) or
 * without an installation.
 */
export function useToolchainManagerClient(
  installation: string | undefined,
): ToolchainManagerClient | undefined {
  const musterApi = useMusterPluginApi();
  return useMemo(
    () => toolchainManagerClientFor(musterApi, installation),
    [musterApi, installation],
  );
}

/** {@link useToolchainManagerClient} outside a hook, for a list of installations. */
function toolchainManagerClientFor(
  musterApi: ReturnType<typeof useMusterPluginApi>,
  installation: string | undefined,
): ToolchainManagerClient | undefined {
  return musterApi && installation
    ? new ToolchainManagerClient(musterApi, installation)
    : undefined;
}

/**
 * The read of an installation's toolchains, shared by the Toolchains tab
 * (`useToolchains`) and the count (`useScopedToolchainCount`): both observe
 * one cache entry, so they must ask for it the same way.
 */
function toolchainsQuery(
  installation: string,
  client: ToolchainManagerClient | undefined,
) {
  return {
    queryKey: musterToolchainsQueryKey(installation),
    queryFn: (): Promise<ToolchainList> => client!.listToolchains(),
    enabled: Boolean(client),
    // A refused or failed read stays so; retrying only delays the message.
    retry: false,
  };
}

/**
 * Whether the installation's muster lists the toolchain-manager: every
 * toolchain surface shows only where it does.
 */
export function useToolchainManagerAvailability(
  installation: string | undefined,
): { isAvailable: boolean; isLoading: boolean } {
  const installations = useMemo(
    () => (installation ? [installation] : []),
    [installation],
  );
  const availability = useMusterServerAvailability(
    TOOLCHAIN_MANAGER_SERVER,
    installations,
  );
  return {
    isAvailable:
      Boolean(installation) &&
      availability.presenceOf(installation!) === 'available',
    isLoading: availability.isLoading,
  };
}

/**
 * The installations in the section's scope whose muster lists the
 * toolchain-manager, and whether any does: `undefined` until one does or
 * every one answered without it. `sharedIdentity`: those whose muster has no
 * per-user sign-in in this portal, where its tools are refused rather than
 * run as muster's shared identity, so the pages say why instead of "not
 * available".
 */
export function useScopedToolchainInstallations(): {
  installations: string[];
  sharedIdentity: string[];
  hasToolchains: boolean | undefined;
  /**
   * Whether every installation in scope said if it has the toolchain-manager:
   * `'reading'` while one may still answer, `'partly'` when one could not be
   * asked (its muster did not answer), `'all'` otherwise. Until `'all'`,
   * `installations` may be missing some that have it.
   */
  answered: 'reading' | 'partly' | 'all';
} {
  const inventory = useInstallationInventory();
  const { scope } = useInstallationScope();
  const scoped = applyInstallationScope(
    inventory.installationsWith('muster'),
    scope,
  );
  const availability = useMusterServerAvailability(
    TOOLCHAIN_MANAGER_SERVER,
    scoped,
  );
  const key = availability.available.join(',');
  const installations = useMemo(() => (key ? key.split(',') : []), [key]);
  const sharedKey = availability.sharedIdentity.join(',');
  const sharedIdentity = useMemo(
    () => (sharedKey ? sharedKey.split(',') : []),
    [sharedKey],
  );
  let answered: 'reading' | 'partly' | 'all' = 'all';
  if (availability.isLoading || inventory.isLoading || inventory.isProbing) {
    answered = 'reading';
  } else if (scoped.some(name => availability.presenceOf(name) === 'unknown')) {
    answered = 'partly';
  }
  let hasToolchains: boolean | undefined;
  if (installations.length > 0) {
    hasToolchains = true;
  } else if (answered === 'all') {
    hasToolchains = false;
  }
  return { installations, sharedIdentity, hasToolchains, answered };
}

/**
 * How many toolchains the installations in scope offer, as the Toolchains tab
 * lists them, each installation's list in the tab's own cached read: `0`
 * where none has the toolchain-manager, `'loading'` until every installation
 * in scope answered whether it has one and every list is read, and
 * `undefined` when an installation could not be asked or a list could not
 * be read (a failure, or a grant or an install the person has yet to give).
 */
export function useScopedToolchainCount(): number | 'loading' | undefined {
  const { installations, hasToolchains, answered } =
    useScopedToolchainInstallations();
  const musterApi = useMusterPluginApi();
  const lists = useQueries({
    queries: installations.map(installation =>
      toolchainsQuery(
        installation,
        toolchainManagerClientFor(musterApi, installation),
      ),
    ),
  });

  // An installation still to answer may add toolchains, and one that could
  // not be asked leaves the count short: unknown, not a partial number.
  if (answered === 'reading') {
    return 'loading';
  }
  if (answered === 'partly') {
    return undefined;
  }
  if (hasToolchains === false) {
    return 0;
  }
  if (!musterApi) {
    return undefined;
  }
  if (lists.some(list => list.isPending)) {
    return 'loading';
  }
  // Every list, or no number: one unread list would leave the count short.
  let count = 0;
  for (const { data } of lists) {
    if (!data || data.status) {
      return undefined;
    }
    count += data.toolchains.length;
  }
  return count;
}

/** The toolchains an installation offers, where it has the toolchain-manager. */
export function useToolchains(installation: string | undefined) {
  const { isAvailable, isLoading } =
    useToolchainManagerAvailability(installation);
  const client = useToolchainManagerClient(installation);
  const enabled = isAvailable && Boolean(client);
  const list = useQuery({
    ...toolchainsQuery(installation ?? '', client),
    enabled,
  });
  return {
    isAvailable,
    list,
    isLoading: isLoading || (enabled && list.isPending),
  };
}

/**
 * One version of a toolchain, the newest without one; of one source's, where
 * two offered sources publish the same name.
 */
export function useToolchainDescription(
  installation: string,
  name: string,
  {
    source,
    version,
    enabled = true,
  }: { source?: string; version?: string; enabled?: boolean } = {},
) {
  const client = useToolchainManagerClient(installation);
  return useQuery({
    queryKey: musterToolchainQueryKey(
      installation,
      source ?? '',
      name,
      version ?? 'latest',
    ),
    queryFn: () =>
      client!.describeToolchain({
        name,
        ...(source ? { source } : {}),
        ...(version ? { version } : {}),
      }),
    enabled: enabled && Boolean(client) && Boolean(name),
    retry: false,
    // A published version's image never changes; the newest moves only with
    // a release, which the list's refresh (whose key this is under) catches.
    staleTime: version ? Infinity : 5 * 60_000,
  });
}

/** The installation's toolchain sources. */
export function useToolchainSources(
  installation: string,
  { enabled = true }: { enabled?: boolean } = {},
) {
  const client = useToolchainManagerClient(installation);
  return useQuery({
    queryKey: musterToolchainSourcesQueryKey(installation),
    queryFn: () => client!.listSources(),
    enabled: enabled && Boolean(client),
    retry: false,
  });
}
