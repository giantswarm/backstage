import { useApi } from '@backstage/core-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { isAwaitingData } from '@giantswarm/backstage-plugin-ui-react';
import { useMemo } from 'react';
import { gitHubApiRef } from '../../apis/github';
import { fetchContent } from './utils/fetchContent';

function toRawGitHubUrl(url: string): string {
  if (!url.startsWith('https://github.com/') || !url.includes('/blob/')) {
    return url;
  }
  return url
    .replace(/^https:\/\/github\.com\//, 'https://raw.githubusercontent.com/')
    .replace('/blob/', '/');
}

export function useKlausSoul(soulUrl: string | undefined) {
  const gitHubApi = useApi(gitHubApiRef);

  const rawUrl = soulUrl ? toRawGitHubUrl(soulUrl) : undefined;

  const {
    data: soul,
    error,
    isPending,
    fetchStatus,
  } = useQuery({
    queryKey: ['klaus-soul', rawUrl],
    queryFn: async () => {
      if (!rawUrl) {
        return null;
      }

      try {
        return await fetchContent(rawUrl, gitHubApi);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(`Error loading SOUL.md from ${rawUrl}:`, err);
        return null;
      }
    },
    enabled: Boolean(rawUrl),
  });
  const isLoading = isAwaitingData({ isPending, fetchStatus });

  return useMemo(
    () => ({
      soul,
      isLoading,
      error,
    }),
    [soul, isLoading, error],
  );
}
