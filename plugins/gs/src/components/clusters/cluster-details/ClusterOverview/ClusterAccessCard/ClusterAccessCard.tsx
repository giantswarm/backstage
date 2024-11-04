import React from 'react';
import { InfoCard, Progress } from '@backstage/core-components';
import { useCurrentCluster } from '../../../ClusterDetailsPage/useCurrentCluster';
import { ClusterAccessGS } from './ClusterAccessGS';
import { ClusterAccessCustomer } from './ClusterAccessCustomer';
import { useCurrentUser } from '../../../../hooks';

export function ClusterAccessCard() {
  const { cluster, installationName } = useCurrentCluster();
  const { isGSUser, isLoading } = useCurrentUser(installationName);

  return (
    <InfoCard title="Kubernetes API access">
      {isLoading && <Progress />}

      {isGSUser !== undefined &&
        (isGSUser ? (
          <ClusterAccessGS
            cluster={cluster}
            installationName={installationName}
          />
        ) : (
          <ClusterAccessCustomer cluster={cluster} />
        ))}
    </InfoCard>
  );
}
