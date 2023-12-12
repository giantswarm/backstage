import { configApiRef, useApi } from '@backstage/core-plugin-api';
import { UseQueryResult } from '@tanstack/react-query';
import { useEffect } from 'react';
import useLocalStorageState from 'use-local-storage-state';

export type InstallationQuery<T = any> = {
  installationName: string;
  query: UseQueryResult<T, unknown>;
};

export type InstallationQueryData<T> = {
  installationName: string;
  data: T;
};

export type InstallationQueriesResult<T> = {
  queries: InstallationQuery<T>[];
  installationsData: InstallationQueryData<T>[];
  initialLoading: boolean;
  retry: () => void;
};

export const useInstallations = (): {
  installations: string[];
  selectedInstallations: string[];
  setSelectedInstallations: (items: string[]) => void;
} => {
  const [savedInstallations, setSavedInstallations] = useLocalStorageState<string[]>('gs-installations', {
    defaultValue: []
  });
  const configApi = useApi(configApiRef);
  const installationsConfig = configApi.getOptionalConfig('gs.installations');
  if (!installationsConfig) {
    throw new Error(`Missing gs.installations configuration`)
  }

  const installations = installationsConfig.keys() || [];
  const selectedInstallations = installations.filter((installation) => savedInstallations.includes(installation))
  const setSelectedInstallations = (items: string[]) => {
    setSavedInstallations(items);
  }

  useEffect(() => {
    if (JSON.stringify(selectedInstallations.sort()) !== JSON.stringify(savedInstallations.sort())) {
      setSavedInstallations(selectedInstallations);
    }
  }, [selectedInstallations, savedInstallations, setSavedInstallations]);

  return {
    installations,
    selectedInstallations,
    setSelectedInstallations,
  };
}
