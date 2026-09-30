import {
  AWSCluster,
  AWSClusterRoleIdentity,
  getErrorMessage,
  getIncompatibilityMessage,
  useResource,
  useShowErrors,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { useCurrentCluster } from '../../../../ClusterDetailsPage/useCurrentCluster';
import { AsyncValue } from '@giantswarm/backstage-plugin-ui-react';
import { Account } from '../../../../../UI/Account';

export const AWSAccountField = () => {
  const { cluster, installationName } = useCurrentCluster();

  // Without an infrastructure reference there is nothing to read, and the
  // account reads as not available.
  const infrastructureRef = cluster.getInfrastructureRef();
  const name = infrastructureRef?.name ?? '';
  const namespace = infrastructureRef?.namespace;
  const hasInfrastructureRef = infrastructureRef !== undefined;

  const {
    resource: awsCluster,
    isLoading: awsClusterIsLoading,
    errors: awsClusterErrors,
    error: awsClusterError,
    incompatibilities: awsClusterIncompatibilities,
  } = useResource(
    installationName,
    AWSCluster,
    { name, namespace },
    { enabled: hasInfrastructureRef },
  );

  let awsClusterErrorMessage: string | undefined;
  if (awsClusterError) {
    awsClusterErrorMessage = getErrorMessage({
      error: awsClusterError,
      resourceKind: AWSCluster.kind,
      resourceName: name,
      resourceNamespace: namespace,
    });
  }
  // A disabled query still returns cached incompatibilities.
  if (hasInfrastructureRef && awsClusterIncompatibilities[0]) {
    awsClusterErrorMessage = getIncompatibilityMessage(
      awsClusterIncompatibilities[0],
    );
  }

  useShowErrors(hasInfrastructureRef ? awsClusterErrors : null);

  const identityRef = awsCluster?.getIdentityRef();
  const hasRoleIdentity =
    !!identityRef && identityRef.kind === AWSClusterRoleIdentity.kind;

  const {
    resource: awsClusterRoleIdentity,
    isLoading: identityIsLoading,
    errors: identityErrors,
    error: identityError,
    incompatibilities: identityIncompatibilities,
  } = useResource(
    installationName,
    AWSClusterRoleIdentity,
    {
      name: identityRef?.name ?? '',
    },
    { enabled: hasRoleIdentity },
  );

  let identityErrorMessage: string | undefined;
  if (identityError) {
    identityErrorMessage = getErrorMessage({
      error: identityError,
      resourceKind: AWSClusterRoleIdentity.kind,
      resourceName: identityRef?.name ?? '',
    });
  }
  if (hasRoleIdentity && identityIncompatibilities[0]) {
    identityErrorMessage = getIncompatibilityMessage(
      identityIncompatibilities[0],
    );
  }

  useShowErrors(hasRoleIdentity ? identityErrors : null);

  const accountId = awsClusterRoleIdentity?.getAWSAccountId();
  const accountUrl = awsClusterRoleIdentity?.getAWSAccountUrl();

  const isLoading = awsClusterIsLoading || identityIsLoading;
  const errorMessage = awsClusterErrorMessage ?? identityErrorMessage;

  return (
    <AsyncValue
      isLoading={isLoading}
      errorMessage={errorMessage}
      value={accountId}
    >
      {value => (
        <Account accountId={value} accountUrl={accountUrl} colored={false} />
      )}
    </AsyncValue>
  );
};
