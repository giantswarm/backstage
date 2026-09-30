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
import type { InfrastructureRef } from '../../../ClusterSwitch';

export const AWSAccountField = ({
  infrastructureRef,
}: {
  infrastructureRef: InfrastructureRef;
}) => {
  const { installationName } = useCurrentCluster();

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

  // Disabled for an identity of another kind, the query still returns what was
  // cached under the same name for another cluster — an error or an
  // incompatibility that has nothing to do with this one.
  let identityErrorMessage: string | undefined;
  if (hasRoleIdentity && identityError) {
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
