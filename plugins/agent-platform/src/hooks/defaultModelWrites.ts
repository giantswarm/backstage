import type { QueryClient } from '@tanstack/react-query';
import { ModelConfig } from '@giantswarm/backstage-plugin-kubernetes-react';

import { musterAgentManagerModelConfigsQueryKey } from '../lib/queryKeys';

export async function invalidateModelReads(
  queryClient: QueryClient,
  installation: string,
  namespace: string,
): Promise<void> {
  const gvk = ModelConfig.getGVK();
  await Promise.all([
    ...['list', 'get'].map(operation =>
      queryClient.invalidateQueries({
        queryKey: [
          'cluster',
          installation,
          operation,
          gvk.group,
          gvk.apiVersion,
          gvk.plural,
        ].filter(Boolean),
      }),
    ),
    queryClient.invalidateQueries({
      queryKey: musterAgentManagerModelConfigsQueryKey(installation, namespace),
    }),
  ]);
}
