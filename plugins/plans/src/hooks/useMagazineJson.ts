import { useApi } from '@backstage/frontend-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { plansApiRef } from '../apis';

/** The magazine repository at one of its refs. */
export interface MagazineSource {
  repository: string;
  ref: string;
}

/**
 * One generated magazine file, parsed. Keyed under `plans` so the GitHub
 * connect flow's invalidation refreshes it with every other plans query.
 */
export function useMagazineJson<T>(source: MagazineSource, path: string) {
  const plansApi = useApi(plansApiRef);
  return useQuery({
    queryKey: ['plans', 'magazine', source.repository, source.ref, path],
    queryFn: async () => {
      const { content } = await plansApi.getContent(
        path,
        source.ref,
        source.repository,
      );
      return JSON.parse(content) as T;
    },
  });
}
