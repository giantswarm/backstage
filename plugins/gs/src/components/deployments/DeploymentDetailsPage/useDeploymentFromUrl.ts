import { useRouteRefParams } from '@backstage/core-plugin-api';
import { deploymentDetailsRouteRef } from '../../../routes';
import {
  App,
  AppKind,
  Deployment,
  HelmRelease,
  HelmReleaseKind,
} from '@giantswarm/backstage-plugin-gs-common';
import { useResource } from '../../hooks';

export const useDeploymentFromUrl = (): {
  installationName: string;
  deployment?: Deployment;
  loading: boolean;
  error: Error | null;
} => {
  const { installationName, kind, namespace, name } = useRouteRefParams(
    deploymentDetailsRouteRef,
  );

  const {
    data: app,
    isLoading: isLoadingApp,
    error: appError,
  } = useResource<App>(
    {
      kind: AppKind,
      installationName,
      name,
      namespace,
    },
    {
      enabled: kind === 'app',
    },
  );

  const {
    data: helmRelease,
    isLoading: isLoadingHelmRelease,
    error: helmReleaseError,
  } = useResource<HelmRelease>(
    {
      kind: HelmReleaseKind,
      installationName,
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
