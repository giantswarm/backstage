import useAsyncRetry from 'react-use/lib/useAsyncRetry';
import { gsApiRef } from '../apis/GSApi';
import { useApi } from '@backstage/core-plugin-api';
import { ICluster } from '../model/services/mapi/capiv1beta1';

export type FulfilledClustersResult = {
  installationName: string;
  status: 'fulfilled',
  value: ICluster[];
};

export type RejectedClustersResult = {
  installationName: string;
  status: 'rejected',
  reason: any;
}

export type ClustersResult = FulfilledClustersResult | RejectedClustersResult;

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
    value: clustersResults,
    retry,
    error,
  } = useAsyncRetry<ClustersResult[]>(async () => {
    const responses = await Promise.allSettled(
      installations.map((installationName) => api.listClusters({ installationName, namespace }))
    );

    const result: ClustersResult[] = responses.map((response, idx) => {
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
      clustersResults,
      error,
    },
    {
      retry,
    },
  ] as const;
}
