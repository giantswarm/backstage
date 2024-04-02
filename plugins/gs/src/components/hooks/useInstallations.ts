import { configApiRef, useApi } from '@backstage/core-plugin-api';
import { useEffect } from 'react';
import useLocalStorageState from 'use-local-storage-state';

export const useInstallations = (): {
  installations: string[];
  selectedInstallations: string[];
  setSelectedInstallations: (items: string[]) => void;
} => {
  const [savedInstallations, setSavedInstallations] = useLocalStorageState<
    string[]
  >('gs-installations', {
    defaultValue: [],
  });
  const configApi = useApi(configApiRef);
  const installationsConfig = configApi.getOptional('gs.installations');
  if (!installationsConfig) {
    throw new Error(`Missing gs.installations configuration`);
  }

  const installations = Array.isArray(installationsConfig)
    ? configApi.getStringArray('gs.installations')
    : configApi.getConfig('gs.installations').keys();

  const selectedInstallations = installations.filter(installation =>
    savedInstallations.includes(installation),
  );
  const setSelectedInstallations = (items: string[]) => {
    setSavedInstallations(items);
  };

  useEffect(() => {
    if (
      JSON.stringify(selectedInstallations.sort()) !==
      JSON.stringify(savedInstallations.sort())
    ) {
      setSavedInstallations(selectedInstallations);
    }
  }, [selectedInstallations, savedInstallations, setSavedInstallations]);

  return {
    installations,
    selectedInstallations,
    setSelectedInstallations,
  };
};
