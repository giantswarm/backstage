import useAsyncRetry from 'react-use/lib/useAsyncRetry';
import { gsApiRef } from '../apis/GSApi';
import { useApi } from '@backstage/core-plugin-api';
import { IApp } from '../model/services/mapi/applicationv1alpha1';

type BaseRequestResult = {
  installationName: string;
}

export type FulfilledRequestResult<T> = BaseRequestResult & {
  status: 'fulfilled',
  value: T[];
};

export type RejectedRequestResult = BaseRequestResult & {
  status: 'rejected',
  reason: any;
}

export type RequestResult<T> = FulfilledRequestResult<T> | RejectedRequestResult;

type Options = {
  installations: string[];
  namespace?: string;
}

export function useApps({
  installations,
  namespace,
}: Options) {
  const api = useApi(gsApiRef);

  const {
    loading,
    value,
    retry,
    error,
  } = useAsyncRetry<RequestResult<IApp>[]>(async () => {
    const responses = await Promise.allSettled(
      installations.map((installationName) => api.listApps({ installationName, namespace }))
    );

    const result: RequestResult<IApp>[] = responses.map((response, idx) => {
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
