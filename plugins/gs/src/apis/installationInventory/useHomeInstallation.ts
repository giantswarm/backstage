import { useMemo } from 'react';
import { configApiRef, useApi } from '@backstage/core-plugin-api';
import { InstallationConfig, useInstallations } from '../installations';

/**
 * The home installation: the `gs.installations` entry whose
 * `oidcTokenProvider` is the frontend's main sign-in provider
 * (`gs.authProvider`). Its kubernetes token is the person's main-login ID
 * token; every other installation is reached with a token the cluster token
 * broker mints for it. On the central Dev Portal that is the portal's own
 * management cluster; on a standalone install it is the release itself.
 */
export function findHomeInstallation(
  installations: InstallationConfig[],
  mainProvider: string | undefined,
): InstallationConfig | undefined {
  if (!mainProvider) {
    return undefined;
  }
  return installations.find(
    installation => installation.oidcTokenProvider === mainProvider,
  );
}

export type UseHomeInstallationResult = {
  home: InstallationConfig | undefined;
  /** True until the installations config has loaded. */
  isLoading: boolean;
};

export function useHomeInstallation(): UseHomeInstallationResult {
  const configApi = useApi(configApiRef);
  const { installations, isLoading } = useInstallations();
  const mainProvider = configApi.getOptionalString('gs.authProvider');

  return useMemo(
    () => ({
      home: findHomeInstallation(installations, mainProvider),
      isLoading,
    }),
    [installations, mainProvider, isLoading],
  );
}
