import { Query, QueryCache, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import debounce from 'lodash/debounce';
// import useDebounce from 'react-use/esm/useDebounce';

function getStatuses(queryCache: QueryCache) {
  const queries = queryCache.findAll({ type: 'active' });
  const queriesByInstallationName = new Map<string, Query[]>();
  queries.forEach(item => {
    const key = item.queryKey[0] ? (item.queryKey[0] as string) : null;
    if (key) {
      const collection = queriesByInstallationName.get(key);
      if (!collection) {
        queriesByInstallationName.set(key, [item]);
      } else {
        collection.push(item);
      }
    }
  });

  return Array.from(queriesByInstallationName).map(
    ([installationName, installationQueries]) => {
      const errors = installationQueries
        .filter(query => query.state.status === 'error')
        .map(query => [query.queryKey.join('/'), query.state.error as Error]);

      return {
        installationName,
        isLoading: installationQueries.some(
          query => query.state.status === 'pending',
        ),
        isError: installationQueries.some(
          query => query.state.status === 'error',
        ),
        errors: Object.fromEntries(errors),
      };
    },
  );
}

export type InstallationStatus = {
  installationName: string;
  isLoading: boolean;
  isError: boolean;
  errors: { [key: string]: Error };
};

export const useInstallationsStatuses = (): {
  installationsStatuses: InstallationStatus[];
} => {
  const queryClient = useQueryClient();
  const queryCache = queryClient.getQueryCache();
  const [installationsStatuses, setInstallationsStatuses] = useState<
    InstallationStatus[]
  >(getStatuses(queryCache));

  const installationsStatusesHash = JSON.stringify(installationsStatuses);
  useEffect(() => {
    const debouncedUpdate = debounce(() => {
      const statuses = getStatuses(queryCache);

      if (installationsStatusesHash !== JSON.stringify(statuses)) {
        setInstallationsStatuses(statuses);
      }
    }, 200);

    const unsubscribe = queryCache.subscribe(debouncedUpdate);

    return () => {
      unsubscribe();
    };
  }, [installationsStatusesHash, queryCache]);

  return {
    installationsStatuses,
  };
};
