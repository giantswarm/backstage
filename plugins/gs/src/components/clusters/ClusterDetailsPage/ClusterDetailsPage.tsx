import React from 'react';
import { GSContext } from '../../GSContext';
import { AsyncClusterProvider } from './useCurrentCluster';
import { ClusterLayout } from '../ClusterLayout';
import { ClusterOverview } from '../cluster-details/ClusterOverview';
import { useCurrentUser } from '../../hooks';
import { ClusterSSHAccess } from '../cluster-details/ClusterSSHAccess';

export const ClusterDetailsPage = () => {
  const { isGSUser } = useCurrentUser();

  return (
    <GSContext>
      <AsyncClusterProvider>
        <ClusterLayout>
          <ClusterLayout.Route path="/" title="Overview">
            <ClusterOverview />
          </ClusterLayout.Route>
          <ClusterLayout.Route
            path="/ssh-access"
            title="SSH access"
            if={() => isGSUser}
          >
            <ClusterSSHAccess />
          </ClusterLayout.Route>
        </ClusterLayout>
      </AsyncClusterProvider>
    </GSContext>
  );
};
