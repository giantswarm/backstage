import { useSearchParams } from 'react-router-dom';
import qs from 'qs';
import { useMemo, useState } from 'react';

export type SelectedResourceRef = {
  cluster: string;
  kind: string;
  name: string;
  namespace?: string;
};

function updateSearchParams(params: Record<string, string | undefined>) {
  const oldParams = qs.parse(location.search, {
    ignoreQueryPrefix: true,
    allowEmptyArrays: true,
  });
  const newParams = qs.stringify(
    {
      ...oldParams,
      ...params,
    },
    {
      addQueryPrefix: true,
      arrayFormat: 'repeat',
      allowEmptyArrays: true,
    },
  );
  if (newParams !== location.search) {
    const newUrl = `${window.location.pathname}${newParams}`;
    window.history?.replaceState(null, document.title, newUrl);
  }
}

export function useSelectedResource() {
  const [searchParams] = useSearchParams();

  const cluster = searchParams.get('sr-cluster');
  const kind = searchParams.get('sr-kind');
  const name = searchParams.get('sr-name');
  const namespace = searchParams.get('sr-namespace');

  const [selectedResourceRef, setSelectedResourceRef] =
    useState<SelectedResourceRef | null>(
      cluster && kind && namespace && name
        ? { cluster, kind, namespace, name }
        : null,
    );

  return useMemo(() => {
    return {
      selectedResourceRef,
      clearSelectedResource: () => {
        updateSearchParams({
          'sr-cluster': undefined,
          'sr-kind': undefined,
          'sr-name': undefined,
          'sr-namespace': undefined,
        });
        setSelectedResourceRef(null);
      },
      setSelectedResource: (resourceRef: SelectedResourceRef) => {
        updateSearchParams({
          'sr-cluster': resourceRef.cluster,
          'sr-kind': resourceRef.kind.toLowerCase(),
          'sr-name': resourceRef.name,
          'sr-namespace': resourceRef.namespace,
        });
        setSelectedResourceRef({
          ...resourceRef,
          kind: resourceRef.kind.toLowerCase(),
        });
      },
    };
  }, [selectedResourceRef]);
}
