import { configApiRef, useApi } from '@backstage/core-plugin-api';
import { useEffect } from 'react';
import useLocalStorageState from 'use-local-storage-state';

export type InstallationInfo = {
  name: string;
  pipeline: string;
  providers: string[];
  baseDomain?: string;
  region?: string;
};

export const useInstallations = (): {
  installations: string[];
  installationsInfo: InstallationInfo[];
  activeInstallations: string[];
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
      baseDomain: installationConfig.getOptionalString('baseDomain'),
      region: installationConfig.getOptionalString('region'),
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

  const activeInstallations =
    selectedInstallations.length > 0 ? selectedInstallations : installations;

  return {
    installations,
    installationsInfo,
    activeInstallations,
    selectedInstallations,
    setSelectedInstallations,
  };
};
