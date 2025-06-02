import { configApiRef, fetchApiRef, useApi } from '@backstage/core-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import useLocalStorageState from 'use-local-storage-state';
import { DiscoveryApiClient } from '../../../apis/discovery/DiscoveryApiClient';

export type InstallationInfo = {
  name: string;
  pipeline: string;
  providers: string[];
  baseDomain?: string;
  region?: string;
};

const STATUS_CHECK_TIMEOUT = 5000;
const STATUS_CHECK_INTERVAL = 20000;

const useDisabledInstallations = () => {
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

export const useInstallationsData = (): {
  installations: string[];
  installationsInfo: InstallationInfo[];
  activeInstallations: string[];
  disabledInstallations: string[];
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
    const itemsToSave = [items].flat().filter(Boolean) as string[];
    setSavedInstallations(itemsToSave);
  };

  useEffect(() => {
    if (
      JSON.stringify(selectedInstallations.sort()) !==
      JSON.stringify(savedInstallations.sort())
    ) {
      setSavedInstallations(selectedInstallations);
    }
  }, [selectedInstallations, savedInstallations, setSavedInstallations]);

  const { isLoading: isLoadingDisabledInstallations, disabledInstallations } =
    useDisabledInstallations();

  const activeInstallations = useMemo(() => {
    const allSelectedInstallations =
      installations.length === 1 || selectedInstallations.length === 0
        ? installations
        : selectedInstallations;

    if (
      allSelectedInstallations.some(installation =>
        disabledInstallations.includes(installation),
      ) &&
      isLoadingDisabledInstallations
    ) {
      return []; // Some selected installations are potentially disabled, waiting for status check to complete
    }

    return allSelectedInstallations.filter(
      installationName => !disabledInstallations.includes(installationName),
    );
  }, [
    disabledInstallations,
    installations,
    isLoadingDisabledInstallations,
    selectedInstallations,
  ]);

  return {
    installations,
    installationsInfo,
    activeInstallations,
    disabledInstallations,
    selectedInstallations,
    setSelectedInstallations,
  };
};
