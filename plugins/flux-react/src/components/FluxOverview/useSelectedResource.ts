import { useSearchParams } from 'react-router-dom';

export function useSelectedResource() {
  const [searchParams, setSearchParams] = useSearchParams();
  const cluster = searchParams.get('cluster');
  const kind = searchParams.get('kind');
  const namespace = searchParams.get('namespace');
  const name = searchParams.get('name');

  const selectedResourceRef =
    cluster && kind && namespace && name
      ? { cluster, kind, namespace, name }
      : undefined;

  return {
    selectedResourceRef,
    clearSelectedResource: () => {
      setSearchParams({});
    },
  };
}
