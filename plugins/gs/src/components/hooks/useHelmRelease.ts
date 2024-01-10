import { gsApiRef } from '../../apis';
import { useApi } from '@backstage/core-plugin-api';
import { useQuery } from '@tanstack/react-query';

export function useHelmRelease(installationName: string, namespace: string, name: string) {
  const api = useApi(gsApiRef);

  return useQuery({
    queryKey: [installationName, 'helmreleases', namespace, name],
    queryFn: () => api.getHelmRelease({ installationName, namespace, name }),
  });
}
