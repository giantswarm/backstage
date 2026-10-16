import { useMemo } from 'react';
import { useResources } from '@giantswarm/backstage-plugin-kubernetes-react';
import { connectorNames } from '../../lib/connectorName';
import { MCPServer } from '../../lib/k8s';

/**
 * What people call the servers muster names by resource name, as Customize
 * lists them (`connectorNames`): read from the installation's MCPServers,
 * only while there is a name to show and `enabled` (a background reader turns
 * it off once the portal session is gone: the read would ask for the sign-in).
 * A server no MCPServer describes, or one not read yet, keeps its name.
 */
export function useServerLabels(
  installation: string | undefined,
  names: string[],
  options: { enabled?: boolean } = {},
): (name: string) => string {
  const enabled =
    (options.enabled ?? true) && Boolean(installation) && names.length > 0;
  // Read once and kept: names hardly change, and a reader in the background
  // must not ask for the cluster token again on its own (MCPServer has one
  // API version, so there is nothing to discover either).
  const { resources } = useResources(
    enabled ? [installation!] : [],
    MCPServer,
    {},
    { enabled, enableDiscovery: false, staleTime: Infinity },
  );
  const key = names.join('\n');
  return useMemo(() => {
    const labels = connectorNames(key ? key.split('\n') : [], resources);
    return (name: string) => labels.get(name) ?? name;
  }, [key, resources]);
}
