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
 * every one answered without it.
 */
export function useScopedToolchainInstallations(): {
  installations: string[];
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
  return { installations, hasToolchains };
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

/** One version of a toolchain, the newest without one. */
export function useToolchainDescription(
  installation: string,
  name: string,
  version?: string,
  { enabled = true }: { enabled?: boolean } = {},
) {
  const client = useToolchainManagerClient(installation);
  return useQuery({
    queryKey: musterToolchainQueryKey(installation, name, version ?? 'latest'),
    queryFn: () =>
      client!.describeToolchain({
        name,
        ...(version ? { version } : {}),
      }),
    enabled: enabled && Boolean(client) && Boolean(name),
    retry: false,
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
