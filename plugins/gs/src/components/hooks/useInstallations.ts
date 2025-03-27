import { configApiRef, useApi } from '@backstage/core-plugin-api';
import { useEffect } from 'react';
import useLocalStorageState from 'use-local-storage-state';

type InstallationInfo = {
  name: string;
  pipeline: string;
  providers: string[];
};

export const useInstallations = (): {
  installations: string[];
  installationsInfo: InstallationInfo[];
  selectedInstallations: string[];
  setSelectedInstallations: (items: string[]) => void;
} => {
  const [savedInstallations, setSavedInstallations] = useLocalStorageState<
    string[]
  >('gs-installations', {
    defaultValue: [],
  });
  const configApi = useApi(configApiRef);
  const installationsConfig = configApi.getOptionalConfig('gs.installations');
  if (!installationsConfig) {
    throw new Error(`Missing gs.installations configuration`);
  }

  const installations = configApi.getConfig('gs.installations').keys();

  const installationsInfo = installations.map(installation => {
    const installationConfig = installationsConfig.getConfig(installation);
    return {
      name: installation,
      pipeline: installationConfig.getString('pipeline'),
      providers: installationConfig.getOptionalStringArray('providers') ?? [],
    };
  });

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
    installationsInfo,
    selectedInstallations,
    setSelectedInstallations,
  };
};
