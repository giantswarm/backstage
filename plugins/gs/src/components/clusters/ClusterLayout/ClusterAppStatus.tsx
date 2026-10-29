import { Flex, Grid, Text } from '@backstage/ui';
import { AppStatus } from '../../deployments/deployment-details/DeploymentOverview/DeploymentStatusCard/AppStatus';
import { HelmReleaseConditions } from '../../deployments/deployment-details/DeploymentOverview/DeploymentStatusCard/HelmReleaseConditions';
import {
  App,
  HelmRelease,
} from '@giantswarm/backstage-plugin-kubernetes-react';

type ClusterAppStatusProps = {
  /** The App or HelmRelease that installs the cluster. */
  installer: App | HelmRelease;
};

export const ClusterAppStatus = ({ installer }: ClusterAppStatusProps) => {
  return (
    <Grid.Root columns={{ initial: '1', md: '2' }} gap="5">
      <Grid.Item>
        <Flex direction="column" gap="5">
          <Flex direction="column" gap="2">
            <Text as="h2" variant="title-large">
              Cluster creation is in progress.
            </Text>
            <Text variant="body-large">
              Below are details about the cluster {installer.getKind()} resource
              status.
            </Text>
            <Text variant="body-large">
              Reload the page to see the latest status.
            </Text>
          </Flex>
          {installer instanceof App ? (
            <AppStatus app={installer} />
          ) : (
            <HelmReleaseConditions helmrelease={installer} />
          )}
        </Flex>
      </Grid.Item>
    </Grid.Root>
  );
};
