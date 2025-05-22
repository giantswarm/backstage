import { configApiRef, fetchApiRef, useApi } from '@backstage/core-plugin-api';
import { useQueries } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import useLocalStorageState from 'use-local-storage-state';
import { DiscoveryApiClient } from '../../apis/discovery/DiscoveryApiClient';
import { getInstallationsQueriesInfo } from './utils/queries';

export type InstallationInfo = {
  name: string;
  pipeline: string;
  providers: string[];
  baseDomain?: string;
  region?: string;
};

const STATUS_CHECK_TIMEOUT = 3000;
const STATUS_CHECK_INTERVAL = 10000;

const useDisabledInstallations = (installations: string[]) => {
  const fetchApi = useApi(fetchApiRef);
  const configApi = useApi(configApiRef);
  const baseUrlOverrides = DiscoveryApiClient.getBaseUrlOverrides(configApi);
  const installationsWithBaseUrlOverrides = Object.keys(baseUrlOverrides);

  const queries = useQueries({
    queries: installationsWithBaseUrlOverrides.map(installationName => {
      const baseUrlOverride = baseUrlOverrides[installationName];
      return {
        queryKey: [installationName, 'status'],
        queryFn: async () => {
          const statusEndpoint = `${baseUrlOverride}/.backstage/health/v1/readiness`;
          return fetchApi.fetch(statusEndpoint, {
            signal: AbortSignal.timeout(STATUS_CHECK_TIMEOUT),
          });
        },
        retry: false,
        refetchInterval: STATUS_CHECK_INTERVAL,
      };
    }),
  });

  const { queries: installationsQueries } = getInstallationsQueriesInfo(
    installationsWithBaseUrlOverrides,
    queries,
  );

  return useMemo(() => {
    return installations.filter(installation => {
      const installationQuery = installationsQueries.find(
        ({ installationName }) => installationName === installation,
      );

      return installationQuery && !installationQuery.query.isSuccess;
    });
  }, [installations, installationsQueries]);
};

export const useInstallations = (): {
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

  const disabledInstallations = useDisabledInstallations(installations);
  const activeInstallations = (
    selectedInstallations.length > 0 ? selectedInstallations : installations
  ).filter(
    installationName => !disabledInstallations.includes(installationName),
  );

  return {
    installations,
    installationsInfo,
    activeInstallations,
    disabledInstallations,
    selectedInstallations,
    setSelectedInstallations,
  };
};
