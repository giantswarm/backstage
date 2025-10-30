import { useRouteRefParams } from '@backstage/core-plugin-api';
import { deploymentDetailsRouteRef } from '../../../routes';
import {
  App,
  HelmRelease,
  useResource,
} from '@giantswarm/backstage-plugin-kubernetes-react';

export const useDeploymentFromUrl = (): {
  installationName: string;
  deployment?: App | HelmRelease;
  loading: boolean;
  error: Error | null;
} => {
  const { installationName, kind, namespace, name } = useRouteRefParams(
    deploymentDetailsRouteRef,
  );

  const {
    resource: app,
    isLoading: isLoadingApp,
    error: appError,
  } = useResource(
    installationName,
    App,
    { name, namespace },
    { enabled: kind === 'app' },
  );

  const {
    resource: helmRelease,
    isLoading: isLoadingHelmRelease,
    error: helmReleaseError,
  } = useResource(
    installationName,
    HelmRelease,
    {
      name,
      namespace,
    },
    {
      enabled: kind === 'helmrelease',
    },
  );

  const isLoading = isLoadingApp || isLoadingHelmRelease;
  const error = appError || helmReleaseError;

  return {
    installationName,
    deployment: app || helmRelease,
    loading: isLoading,
    error,
  };
};
