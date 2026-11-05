import { useMemo } from 'react';
import { useApiHolder } from '@backstage/core-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { musterApiRef } from '../../apis';
import { connectorLabels } from '../../lib/connectorName';

/** The query of an installation's connector names, shared by every prompt. */
export function connectorNamesQueryKey(installation?: string) {
  return ['muster', 'connector-names', installation] as const;
}

/**
 * What people call the connectors muster names by server name, as Customize
 * lists them (`connectorLabels`): the display names muster-backend reads from
 * muster as the person (`/servers/names`), so they are there for everyone who
 * sees a sign-in prompt, with or without Kubernetes access to the MCPServer
 * objects. One read per installation, shared by every caller and kept: names
 * hardly change. A server muster did not name, every server while the read
 * is under way or after it failed, keeps its own name.
 *
 * The read is silent, as a reader in the background must be: it never asks
 * for the sign-in. `enabled: false` (a background reader once the portal
 * session is gone) skips it.
 */
export function useConnectorLabels(
  installation: string | undefined,
  names: readonly string[],
  options: { enabled?: boolean } = {},
): (name: string) => string {
  // Absent from a portal without the muster plugin: every name stays.
  const musterApi = useApiHolder().get(musterApiRef);
  const enabled =
    (options.enabled ?? true) && Boolean(musterApi) && names.length > 0;
  const { data } = useQuery({
    queryKey: connectorNamesQueryKey(installation),
    queryFn: () => musterApi!.listConnectorNames(installation),
    enabled,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const sources = data?.servers;
  const key = names.join('\n');
  return useMemo(() => {
    const labels = connectorLabels(key ? key.split('\n') : [], sources ?? []);
    return (name: string) => labels.get(name) ?? name;
  }, [key, sources]);
}

/**
 * What people call one connector: {@link useConnectorLabels} of `name`, the
 * name itself until muster said otherwise.
 */
export function useConnectorLabel(
  installation: string | undefined,
  name: string,
): string {
  return useConnectorLabels(installation, [name])(name);
}
