import { useApi } from '@backstage/frontend-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { musterApiRef, type AuthStatusResponse } from '../apis';
import {
  authStatusQueryKey,
  connectingPollInterval,
} from '../components/shared/useServerSignIn';
import { musterPollingOptions } from '../lib/musterPolling';
import type { PollingQuery } from '@giantswarm/backstage-plugin-ui-react';

export function useConnectorAccess(installation: string, enabled: boolean) {
  const api = useApi(musterApiRef);
  const query = useQuery({
    queryKey: authStatusQueryKey(installation),
    queryFn: () => api.getAuthStatus(installation),
    enabled,
    ...musterPollingOptions(
      (pollingQuery: PollingQuery<AuthStatusResponse>) =>
        connectingPollInterval(pollingQuery.state.data),
      { refetchOnVisible: false },
    ),
  });
  return {
    ...query,
    data: query.isError
      ? {
          ...query.data,
          servers: query.data?.servers ?? [],
          unavailable: true,
          message: query.error.message,
        }
      : query.data,
  };
}
