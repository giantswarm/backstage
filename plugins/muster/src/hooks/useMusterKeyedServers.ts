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
  return useMemo(() => {
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
}
