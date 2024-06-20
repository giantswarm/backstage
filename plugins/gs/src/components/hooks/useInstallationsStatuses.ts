import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import useDebounce from 'react-use/esm/useDebounce';
import { getInstallationsStatuses } from './utils/queries';

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
  >(getInstallationsStatuses(queryCache));
  const [updatedAt, setUpdatedAt] = useState(0);

  useEffect(() => {
    return queryCache.subscribe(() => {
      setUpdatedAt(Date.now());
    });
  }, [queryCache]);

  useDebounce(
    () => {
      const statuses = getInstallationsStatuses(queryCache);

      if (JSON.stringify(installationsStatuses) !== JSON.stringify(statuses)) {
        setInstallationsStatuses(statuses);
      }
    },
    200,
    [updatedAt],
  );

  return {
    installationsStatuses,
  };
};
