import {
  Content,
  Header,
  Page,
  Progress,
  RoutedTabs,
  WarningPanel,
} from '@backstage/core-components';
import {
  attachComponentData,
  useElementFilter,
  useRouteRefParams,
} from '@backstage/core-plugin-api';
import { TabProps } from '@material-ui/core/Tab';
import Alert from '@material-ui/lab/Alert';
import React from 'react';
import { useAsyncCluster } from '../ClusterDetailsPage/useCurrentCluster';
import {
  Cluster,
  getClusterDescription,
  isManagementCluster,
} from '@giantswarm/backstage-plugin-gs-common';
import { clusterDetailsRouteRef } from '../../../routes';

export type ClusterLayoutRouteProps = {
  path: string;
  title: string;
  children: JSX.Element;
  if?: (cluster: Cluster) => boolean;
  tabProps?: TabProps<React.ElementType, { component?: React.ElementType }>;
};

const dataKey = 'plugin.gs.clusterLayoutRoute';

const Route: (props: ClusterLayoutRouteProps) => null = () => null;
attachComponentData(Route, dataKey, true);
attachComponentData(Route, 'core.gatherMountPoints', true); // This causes all mount points that are discovered within this route to use the path of the route itself

export interface ClusterLayoutProps {
  children?: React.ReactNode;
}

export const ClusterLayout = ({ children }: ClusterLayoutProps) => {
  const { installationName, name } = useRouteRefParams(clusterDetailsRouteRef);
  const { cluster, loading, error } = useAsyncCluster();
  const routes = useElementFilter(
    children,
    elements =>
      elements
        .selectByComponentData({
          key: dataKey,
          withStrictError:
            'Child of ClusterLayout must be a ClusterLayout.Route',
        })
        .getElements<ClusterLayoutRouteProps>()
        .flatMap(({ props: elementProps }) => {
          if (!cluster) {
            return [];
          } else if (elementProps.if && !elementProps.if(cluster)) {
            return [];
          }

          return [
            {
              path: elementProps.path,
              title: elementProps.title,
              children: elementProps.children,
              tabProps: elementProps.tabProps,
            },
          ];
        }),
    [cluster],
  );

  let headerTitle = `Cluster ${name}`;
  if (cluster && !isManagementCluster(cluster, installationName)) {
    headerTitle += ` in ${installationName}`;
  }

  return (
    <Page themeId="service">
      <Header
        title={headerTitle}
        subtitle={cluster ? getClusterDescription(cluster) : undefined}
        type="resource - kubernetes cluster"
      />
      {loading && <Progress />}
      {cluster && <RoutedTabs routes={routes} />}
      {error && (
        <Content>
          <Alert severity="error">{error.toString()}</Alert>
        </Content>
      )}
      {!loading && !error && !cluster && (
        <Content>
          <WarningPanel title="Error">
            There is no cluster with the requested installation, namespace, and
            name.
          </WarningPanel>
        </Content>
      )}
    </Page>
  );
};

ClusterLayout.Route = Route;
