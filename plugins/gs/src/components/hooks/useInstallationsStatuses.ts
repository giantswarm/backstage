import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

export type InstallationStatus = {
  installationName: string;
  isLoading: boolean;
  isError: boolean;
  errors: {[key: string]: Error };
}

export const useInstallationsStatuses = (selectedInstallations: string[]): {
  installationsStatuses: InstallationStatus[],
} => {
  const [installationsStatuses, setInstallationsStatuses] = useState<InstallationStatus[]>([]);
  const queryClient = useQueryClient();
  const queryCache = queryClient.getQueryCache();

  useEffect(() => {
    const unsubscribe = queryCache.subscribe(() => {
      const statuses = selectedInstallations.map((installationName) => {
        const queries = queryCache.findAll({ queryKey: [installationName] });
        const errors = queries.filter(
          (query) => query.state.status === 'error'
        ).map((query) => [query.queryKey.join('/'), query.state.error as Error]);

        return {
          installationName,
          isLoading: queries.some((query) => query.state.status === 'pending'),
          isError: queries.some((query) => query.state.status === 'error'),
          errors: Object.fromEntries(errors),
        };
      });

      if (JSON.stringify(installationsStatuses) !== JSON.stringify(statuses)) {
        setInstallationsStatuses(statuses);
      }
    });

    return unsubscribe;
  }, [selectedInstallations, installationsStatuses, queryCache])

  return {
    installationsStatuses,
  };
}
