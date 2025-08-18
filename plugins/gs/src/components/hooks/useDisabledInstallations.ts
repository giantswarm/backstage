import { fetchApiRef, useApi } from '@backstage/core-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { DiscoveryApiClient } from '../../apis/discovery/DiscoveryApiClient';

const STATUS_CHECK_TIMEOUT = 5000;
const STATUS_CHECK_INTERVAL = 20000;
export const useDisabledInstallations = () => {
  const fetchApi = useApi(fetchApiRef);
  const baseUrlOverrides = DiscoveryApiClient.getBaseUrlOverrides();
  const uniqueEndpoints = Array.from(new Set(Object.values(baseUrlOverrides)));

  const { data: endpointStatuses, isLoading } = useQuery({
    queryKey: ['installations', 'status'],
    queryFn: async () => {
      const requestPromises = uniqueEndpoints.map(endpoint => {
        const statusEndpoint = `${endpoint}/.backstage/health/v1/readiness`;
        return fetchApi.fetch(statusEndpoint, {
          signal: AbortSignal.timeout(STATUS_CHECK_TIMEOUT),
        });
      });

      const results = await Promise.allSettled(requestPromises);
      return Object.fromEntries(
        results.map((result, idx) => [
          uniqueEndpoints[idx],
          result.status === 'fulfilled',
        ]),
      );
    },
    retry: false,
    refetchInterval: STATUS_CHECK_INTERVAL,
  });

  const installationsWithBaseUrlOverrides = Object.keys(baseUrlOverrides);

  const disabledInstallations = installationsWithBaseUrlOverrides.filter(
    installationName => {
      const endpoint = baseUrlOverrides[installationName];
      return !endpointStatuses || endpointStatuses[endpoint] === false;
    },
  );

  return {
    isLoading,
    disabledInstallations,
  };
};
