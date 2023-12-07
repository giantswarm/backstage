import useAsyncRetry from 'react-use/lib/useAsyncRetry';
import { gsApiRef, RequestResult } from '../apis';
import { useApi } from '@backstage/core-plugin-api';
import { IHelmRelease } from '../model/services/mapi/helmv2beta1';

type Options = {
  installations: string[];
  namespace?: string;
}

export function useHelmReleases({
  installations,
  namespace,
}: Options) {
  const api = useApi(gsApiRef);

  const {
    loading,
    value,
    retry,
    error,
  } = useAsyncRetry<RequestResult<IHelmRelease>[]>(async () => {
    const responses = await Promise.allSettled(
      installations.map((installationName) => api.listHelmReleases({ installationName, namespace }))
    );

    const result: RequestResult<IHelmRelease>[] = responses.map((response, idx) => {
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
