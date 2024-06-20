import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import debounce from 'lodash/debounce';
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

  const installationsStatusesHash = JSON.stringify(installationsStatuses);
  useEffect(() => {
    const debouncedUpdate = debounce(() => {
      const statuses = getInstallationsStatuses(queryCache);

      if (installationsStatusesHash !== JSON.stringify(statuses)) {
        setInstallationsStatuses(statuses);
      }
    }, 200);

    return queryCache.subscribe(debouncedUpdate);
  }, [installationsStatusesHash, queryCache]);

  return {
    installationsStatuses,
  };
};
