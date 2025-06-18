import { Deployment } from '@giantswarm/backstage-plugin-gs-common';
import { createContext, ReactNode, useContext } from 'react';
import { useDeploymentFromUrl } from './useDeploymentFromUrl';

export type DeploymentLoadingStatus = {
  installationName: string;
  deployment?: Deployment;
  loading: boolean;
  error: Error | null;
};

const DeploymentContext = createContext<DeploymentLoadingStatus>({
  installationName: '',
  deployment: undefined,
  loading: false,
  error: null,
});

export interface AsyncDeploymentProviderProps {
  children: ReactNode;
}

/**
 * Provides a loaded deployment to be picked up by the `useCurrentDeployment` hook.
 *
 * @public
 */
export const AsyncDeploymentProvider = ({
  children,
}: AsyncDeploymentProviderProps) => {
  const { installationName, deployment, loading, error } =
    useDeploymentFromUrl();

  const value = { installationName, deployment, loading, error };

  return (
    <DeploymentContext.Provider value={value}>
      {children}
    </DeploymentContext.Provider>
  );
};

/**
 * Grab the current deployment from the context, throws if the deployment has not yet been loaded
 * or is not available.
 *
 * @public
 */
export function useCurrentDeployment(): {
  installationName: string;
  deployment: Deployment;
} {
  const value = useContext(DeploymentContext);

  if (!value) {
    throw new Error('DeploymentContext not available');
  }

  if (!value.deployment) {
    throw new Error(
      'useCurrentDeployment hook is being called outside of an DeploymentLayout where the deployment has not been loaded. If this is intentional, please use useAsyncDeployment instead.',
    );
  }

  return {
    installationName: value.installationName,
    deployment: value.deployment,
  };
}

/**
 * Grab the current deployment from the context, provides loading state and errors, and the ability to refresh.
 *
 * @public
 */
export function useAsyncDeployment(): DeploymentLoadingStatus {
  const value = useContext(DeploymentContext);

  if (!value) {
    throw new Error('DeploymentContext not available');
  }

  const { installationName, deployment, loading, error } = value;

  return { installationName, deployment, loading, error };
}
