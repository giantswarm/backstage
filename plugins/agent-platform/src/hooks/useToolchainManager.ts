import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
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
import { TOOLCHAIN_MANAGER_SERVER } from '../lib/toolchainManager';
import { useMusterPluginApi } from './useMusterPluginApi';
import { useMusterServerAvailability } from './useMusterServerAvailability';

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
    () =>
      musterApi && installation
        ? new ToolchainManagerClient(musterApi, installation)
        : undefined,
    [musterApi, installation],
  );
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
  let hasToolchains: boolean | undefined;
  if (installations.length > 0) {
    hasToolchains = true;
  } else if (
    !availability.isLoading &&
    !inventory.isLoading &&
    !inventory.isProbing &&
    scoped.every(name => availability.presenceOf(name) !== 'unknown')
  ) {
    hasToolchains = false;
  }
  return { installations, sharedIdentity, hasToolchains };
}

/** The toolchains an installation offers, where it has the toolchain-manager. */
export function useToolchains(installation: string | undefined) {
  const { isAvailable, isLoading } =
    useToolchainManagerAvailability(installation);
  const client = useToolchainManagerClient(installation);
  const enabled = isAvailable && Boolean(client);
  const list = useQuery({
    queryKey: musterToolchainsQueryKey(installation ?? ''),
    queryFn: () => client!.listToolchains(),
    enabled,
    retry: false,
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
