import { useMemo } from 'react';
import { useApiHolder } from '@backstage/core-plugin-api';
import { useQueries } from '@tanstack/react-query';

import { musterApiRef } from '../apis';
import { connectorNamesQueryOptions } from '../components/shared/hooks/useConnectorLabels';
import { withMusterKeys } from '../lib/connectorKey';
import type { MCPServer } from '../lib/k8s';

/**
 * The MCPServer CRs, each with muster's key for it ({@link withMusterKeys}),
 * from the keys muster names each installation's servers by: its silent
 * `/servers/names` read, which the sign-in prompts' names share. Until muster
 * answered, or without the muster plugin, the servers come back as they are.
 */
export function useMusterKeyedServers(servers: MCPServer[]): MCPServer[] {
  return useMusterKeyedServersState(servers).servers;
}

/**
 * {@link useMusterKeyedServers}, and whether muster's keys are still being
 * read (`isLoadingKeys`): until they are, an organization's server and
 * muster's own outside the chart's namespace look alike, so a decision that
 * tells them apart waits. A read that failed counts as done: the servers
 * then keep the chart's namespace as muster's.
 */
export function useMusterKeyedServersState(servers: MCPServer[]): {
  servers: MCPServer[];
  isLoadingKeys: boolean;
} {
  const musterApi = useApiHolder().get(musterApiRef);
  const installations = useMemo(
    () => [...new Set(servers.map(server => server.cluster))].sort(),
    [servers],
  );
  const answers = useQueries({
    queries: installations.map(installation => ({
      ...connectorNamesQueryOptions(musterApi, installation),
      enabled: Boolean(musterApi),
    })),
  });
  // Keyed on what was read: `useQueries` returns fresh arrays every render.
  const signature = answers
    .map(answer =>
      answer.data ? answer.data.servers.map(s => s.name).join(',') : '-',
    )
    .join('|');
  const isLoadingKeys =
    Boolean(musterApi) && answers.some(answer => answer.status === 'pending');
  const keyed = useMemo(() => {
    const names = new Map(
      signature
        .split('|')
        .map((list, index) => [
          installations[index],
          list === '-' ? undefined : new Set(list ? list.split(',') : []),
        ]),
    );
    return withMusterKeys(servers, installation => names.get(installation));
  }, [servers, installations, signature]);
  return { servers: keyed, isLoadingKeys };
}
