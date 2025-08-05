import { useSearchParams } from 'react-router-dom';

export function useSelectedResource() {
  const [searchParams] = useSearchParams();
  const cluster = searchParams.get('cluster');
  const kind = searchParams.get('kind');
  const namespace = searchParams.get('namespace');
  const name = searchParams.get('name');

  if (!cluster || !kind || !namespace || !name) {
    return undefined;
  }

  return { cluster, kind, namespace, name };
}
