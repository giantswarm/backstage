import {
  AWSCluster,
  AzureCluster,
  Cluster,
  useResource,
  VCDCluster,
  VSphereCluster,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { getErrorMessage } from './utils/helpers';

export function useProviderClusterForCluster(cluster: Cluster) {
  const infrastructureRef = cluster.getInfrastructureRef();
  if (!infrastructureRef) {
    throw new Error(
      'There is no infrastructure reference defined in the cluster resource.',
    );
  }

  const {
    kind: providerClusterKind,
    name: providerClusterName,
    namespace: providerClusterNamespace,
  } = infrastructureRef;

  const {
    resource: awsCluster,
    isLoading: isLoadingAWSCluster,
    errors: awsClusterErrors,
    error: awsClusterError,
  } = useResource(
    cluster.cluster,
    AWSCluster,
    {
      name: providerClusterName,
      namespace: providerClusterNamespace,
    },
    {
      enabled: providerClusterKind === AWSCluster.kind,
    },
  );

  const {
    resource: azureCluster,
    isLoading: isLoadingAzureCluster,
    errors: azureClusterErrors,
    error: azureClusterError,
  } = useResource(
    cluster.cluster,
    AzureCluster,
    {
      name: providerClusterName,
      namespace: providerClusterNamespace,
    },
    {
      enabled: providerClusterKind === AzureCluster.kind,
    },
  );

  const {
    resource: vSphereCluster,
    isLoading: isLoadingVSphereCluster,
    errors: vSphereClusterErrors,
    error: vSphereClusterError,
  } = useResource(
    cluster.cluster,
    VSphereCluster,
    {
      name: providerClusterName,
      namespace: providerClusterNamespace,
    },
    {
      enabled: providerClusterKind === VSphereCluster.kind,
    },
  );

  const {
    resource: vCDCluster,
    isLoading: isLoadingVCDCluster,
    errors: vCDClusterErrors,
    error: vCDClusterError,
  } = useResource(
    cluster.cluster,
    VCDCluster,
    {
      name: providerClusterName,
      namespace: providerClusterNamespace,
    },
    {
      enabled: providerClusterKind === VCDCluster.kind,
    },
  );

  const error =
    awsClusterError ||
    azureClusterError ||
    vSphereClusterError ||
    vCDClusterError;

  let errorMessage;
  if (error) {
    errorMessage = getErrorMessage({
      error,
      resourceKind: providerClusterKind,
      resourceName: providerClusterName,
      resourceNamespace: providerClusterNamespace,
    });
  }

  return {
    resource: awsCluster || azureCluster || vSphereCluster || vCDCluster,
    isLoading:
      isLoadingAWSCluster ||
      isLoadingAzureCluster ||
      isLoadingVSphereCluster ||
      isLoadingVCDCluster,
    errors: [
      ...awsClusterErrors,
      ...azureClusterErrors,
      ...vSphereClusterErrors,
      ...vCDClusterErrors,
    ],
    errorMessage,
  };
}
