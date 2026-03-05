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
    incompatibility: awsClusterIncompatibility,
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
  if (awsClusterIncompatibility) {
    awsClusterErrorMessage = getIncompatibilityMessage(
      awsClusterIncompatibility,
    );
  }

  useShowErrors(awsClusterErrors);

  const identityRef = awsCluster?.getIdentityRef();

  const {
    resource: awsClusterRoleIdentity,
    isLoading: identityIsLoading,
    errors: identityErrors,
    error: identityError,
    incompatibility: identityIncompatibility,
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
  if (identityIncompatibility) {
    identityErrorMessage = getIncompatibilityMessage(identityIncompatibility);
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
