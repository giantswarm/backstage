import { Divider, Typography } from '@material-ui/core';
import { Progress } from '@backstage/core-components';
import { InfoCard } from '@giantswarm/backstage-plugin-ui-react';
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

      {isGSUser !== undefined && (
        <>
          {isGSUser && (
            <>
              <ClusterAccessGS
                cluster={cluster}
                installationName={installationName}
              />
              <Divider style={{ margin: '16px 0' }} />
              <Typography variant="subtitle2">Customer access</Typography>
            </>
          )}
          <ClusterAccessCustomer
            cluster={cluster}
            installationName={installationName}
          />
        </>
      )}
    </InfoCard>
  );
}
