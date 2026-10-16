import { useMemo } from 'react';
import { useResources } from '@giantswarm/backstage-plugin-kubernetes-react';
import { connectorNames } from '../../lib/connectorName';
import { MCPServer } from '../../lib/k8s';

/**
 * What people call the servers muster names by resource name, as Customize
 * lists them (`connectorNames`): read from the installation's MCPServers,
 * only while there is a name to show. A server no MCPServer describes, or
 * one not read yet, keeps its name.
 */
export function useServerLabels(
  installation: string | undefined,
  names: string[],
): (name: string) => string {
  const enabled = Boolean(installation) && names.length > 0;
  const { resources } = useResources(
    enabled ? [installation!] : [],
    MCPServer,
    {},
    { enabled },
  );
  const key = names.join('\n');
  return useMemo(() => {
    const labels = connectorNames(key ? key.split('\n') : [], resources);
    return (name: string) => labels.get(name) ?? name;
  }, [key, resources]);
}
