import { Query, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

export type InstallationStatus = {
  installationName: string;
  isLoading: boolean;
  isError: boolean;
  errors: { [key: string]: Error };
};

export const useInstallationsStatuses = (): {
  installationsStatuses: InstallationStatus[];
} => {
  const [installationsStatuses, setInstallationsStatuses] = useState<
    InstallationStatus[]
  >([]);
  const queryClient = useQueryClient();
  const queryCache = queryClient.getQueryCache();

  const installationsStatusesHash = JSON.stringify(installationsStatuses);
  useEffect(() => {
    const unsubscribe = queryCache.subscribe(() => {
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

      const statuses = Array.from(queriesByInstallationName).map(
        ([installationName, installationQueries]) => {
          const errors = installationQueries
            .filter(query => query.state.status === 'error')
            .map(query => [
              query.queryKey.join('/'),
              query.state.error as Error,
            ]);

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

      if (installationsStatusesHash !== JSON.stringify(statuses)) {
        setInstallationsStatuses(statuses);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [installationsStatusesHash, queryCache]);

  return {
    installationsStatuses,
  };
};
