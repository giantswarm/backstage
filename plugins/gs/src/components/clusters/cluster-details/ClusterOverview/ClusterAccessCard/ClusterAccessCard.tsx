import React from 'react';
import { InfoCard } from '@backstage/core-components';
import { useCurrentCluster } from '../../../ClusterDetailsPage/useCurrentCluster';
import { ClusterAccessGS } from './ClusterAccessGS';
import { ClusterAccessCustomer } from './ClusterAccessCustomer';
import { useCurrentUser } from '../../../../hooks';

export function ClusterAccessCard() {
  const { cluster, installationName } = useCurrentCluster();
  const { isGSUser } = useCurrentUser();

  return (
    <InfoCard title="Kubernetes API access">
      {isGSUser ? (
        <ClusterAccessGS
          cluster={cluster}
          installationName={installationName}
        />
      ) : (
        <ClusterAccessCustomer cluster={cluster} />
      )}
    </InfoCard>
  );
}
