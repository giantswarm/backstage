import { gsApiRef } from '../apis';
import { useApi } from '@backstage/core-plugin-api';
import { useQuery } from '@tanstack/react-query';

export function useApp(installationName: string, namespace: string, name: string) {
  const api = useApi(gsApiRef);

  return useQuery({
    queryKey: [installationName, 'apps', namespace, name],
    queryFn: () => api.getApp({ installationName, namespace, name }),
  });
}
