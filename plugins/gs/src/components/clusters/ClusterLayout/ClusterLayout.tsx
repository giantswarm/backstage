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
} from '@giantswarm/backstage-plugin-gs-common';
import { clusterDetailsRouteRef } from '../../../routes';
import { useCurrentUser } from '../../hooks';
import { ClusterAppStatus } from './ClusterAppStatus';

export type ClusterLayoutRouteProps = {
  path: string;
  title: string;
  children: JSX.Element;
  if?: (data: {
    cluster: Cluster;
    installationName: string;
    isGSUser: boolean;
  }) => boolean;
  tabProps?: TabProps<React.ElementType, { component?: React.ElementType }>;
};

const dataKey = 'plugin.gs.clusterLayoutRoute';

const Route: (props: ClusterLayoutRouteProps) => null = () => null;
attachComponentData(Route, dataKey, true);
attachComponentData(Route, 'core.gatherMountPoints', true);

export interface ClusterLayoutProps {
  children?: React.ReactNode;
}

export const ClusterLayout = ({ children }: ClusterLayoutProps) => {
  const { name } = useRouteRefParams(clusterDetailsRouteRef);

  const {
    cluster,
    clusterApp,
    installationName,
    loading: clusterIsLoading,
    error: error,
  } = useAsyncCluster();

  const { isGSUser, isLoading: currentUserIsLoading } =
    useCurrentUser(installationName);

  const isLoading = clusterIsLoading || currentUserIsLoading;

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
          if (isLoading || !cluster) {
            return [];
          } else if (
            elementProps.if &&
            !elementProps.if({
              cluster,
              installationName,
              isGSUser: Boolean(isGSUser),
            })
          ) {
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
    [cluster, isLoading, isGSUser],
  );

  return (
    <Page themeId="service">
      <Header
        title={name}
        subtitle={cluster ? getClusterDescription(cluster) : undefined}
        type="resource - kubernetes cluster"
      />
      {isLoading && (
        <Content>
          <Progress />
        </Content>
      )}
      {cluster && <RoutedTabs routes={routes} />}
      {error && !cluster && clusterApp ? (
        <Content>
          <ClusterAppStatus
            installationName={installationName}
            name={clusterApp.metadata.name}
            namespace={clusterApp.metadata.namespace ?? ''}
          />
        </Content>
      ) : null}
      {error && !cluster && !clusterApp ? (
        <Content>
          <Alert severity="error">{error.toString()}</Alert>
        </Content>
      ) : null}
      {!isLoading && !error && !cluster && !clusterApp && (
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
