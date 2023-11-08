import useAsyncRetry from 'react-use/lib/useAsyncRetry';
import { gsApiRef } from '../api/GSApi';
import { useApi } from '@backstage/core-plugin-api';
import { ICluster } from '../model/services/mapi/capiv1beta1';

export function useClusters({ namespace }: { namespace?: string; }) {
  const api = useApi(gsApiRef);

  const {
    loading,
    value: clusters,
    retry,
    error,
  } = useAsyncRetry<ICluster[]>(async () => {
    return await api.listClusters({ namespace });
  }, [namespace]);

  return [
    {
      loading,
      clusters,
      error,
    },
    {
      retry,
    },
  ] as const;
}
