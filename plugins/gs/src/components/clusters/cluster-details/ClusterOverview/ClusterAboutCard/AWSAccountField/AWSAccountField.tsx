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

  const infrastructureRef = cluster.getInfrastructureRef();
  if (!infrastructureRef) {
    throw new Error(
      'There is no infrastructure reference defined in the cluster resource.',
    );
  }

  const { name, namespace } = infrastructureRef;

  const {
    resource: awsCluster,
    isLoading: awsClusterIsLoading,
    errors: awsClusterErrors,
    error: awsClusterError,
    incompatibilities: awsClusterIncompatibilities,
  } = useResource(installationName, AWSCluster, { name, namespace });

  let awsClusterErrorMessage: string | undefined;
  if (awsClusterError) {
    awsClusterErrorMessage = getErrorMessage({
      error: awsClusterError,
      resourceKind: AWSCluster.kind,
      resourceName: name,
      resourceNamespace: namespace,
    });
  }
  if (awsClusterIncompatibilities[0]) {
    awsClusterErrorMessage = getIncompatibilityMessage(
      awsClusterIncompatibilities[0],
    );
  }

  useShowErrors(awsClusterErrors);

  const identityRef = awsCluster?.getIdentityRef();

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
    {
      enabled:
        !!identityRef && identityRef.kind === AWSClusterRoleIdentity.kind,
    },
  );

  let identityErrorMessage: string | undefined;
  if (identityError) {
    identityErrorMessage = getErrorMessage({
      error: identityError,
      resourceKind: AWSClusterRoleIdentity.kind,
      resourceName: identityRef?.name ?? '',
    });
  }
  if (identityIncompatibilities[0]) {
    identityErrorMessage = getIncompatibilityMessage(
      identityIncompatibilities[0],
    );
  }

  useShowErrors(identityErrors);

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
