import useAsyncRetry from 'react-use/lib/useAsyncRetry';
import { gsApiRef, RequestResult } from '../apis';
import { useApi } from '@backstage/core-plugin-api';
import { ICluster } from '../model/services/mapi/capiv1beta1';

type Options = {
  installations: string[];
  namespace?: string;
}

export function useClusters({
  installations,
  namespace,
}: Options) {
  const api = useApi(gsApiRef);

  const {
    loading,
    value,
    retry,
    error,
  } = useAsyncRetry<RequestResult<ICluster>[]>(async () => {
    const responses = await Promise.allSettled(
      installations.map((installationName) => api.listClusters({ installationName, namespace }))
    );

    const result: RequestResult<ICluster>[] = responses.map((response, idx) => {
      return {
        installationName: installations[idx],
        ...response
      };
    });

    return result;
  }, [installations, namespace]);

  return [
    {
      loading,
      value,
      error,
    },
    {
      retry,
    },
  ] as const;
}
