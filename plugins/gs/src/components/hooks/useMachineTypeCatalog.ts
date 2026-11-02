import { useQuery } from '@tanstack/react-query';
import { isAwaitingData } from '@giantswarm/backstage-plugin-ui-react';
import { NON_PERSISTED_QUERY_META } from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  AwsInstanceTypeData,
  AzureVmSizeData,
  MachineTypeCatalog,
  awsMachineTypeCatalog,
  azureMachineTypeCatalog,
} from '../clusters/nodePools';

export type MachineTypeProvider = 'aws' | 'azure';

const catalogs = {
  aws: {
    load: () =>
      import('../clusters/nodePools/data/awsInstanceTypes.json').then(
        m => m.default as AwsInstanceTypeData,
      ),
    toCatalog: awsMachineTypeCatalog,
  },
  azure: {
    load: () =>
      import('../clusters/nodePools/data/azureVmTypes.json').then(
        m => m.default as AzureVmSizeData,
      ),
    toCatalog: azureMachineTypeCatalog,
  },
} as const;

/**
 * The bundled dataset of a provider's machine types (CPU, memory,
 * architecture), loaded as a lazy chunk on first use.
 *
 * The datasets are megabytes of static JSON, so the query is never persisted
 * to localStorage, never refetched and never evicted.
 */
export function useMachineTypeCatalog(
  provider: MachineTypeProvider,
  { enabled = true }: { enabled?: boolean } = {},
): { catalog: MachineTypeCatalog | undefined; isLoading: boolean } {
  const { load, toCatalog } = catalogs[provider];

  const { data, isPending, fetchStatus } = useQuery({
    queryKey: ['machine-type-catalog', provider],
    queryFn: load,
    select: toCatalog as (data: unknown) => MachineTypeCatalog,
    enabled,
    staleTime: Infinity,
    gcTime: Infinity,
    meta: { ...NON_PERSISTED_QUERY_META },
  });
  const isLoading = isAwaitingData({ isPending, fetchStatus });

  return { catalog: data, isLoading: enabled && isLoading };
}
