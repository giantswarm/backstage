import {
  Content,
  Header,
  Page,
  Progress,
  RoutedTabs,
} from '@backstage/core-components';
import {
  attachComponentData,
  useElementFilter,
  useRouteRefParams,
} from '@backstage/core-plugin-api';
import { TabProps } from '@material-ui/core/Tab';
import Alert from '@material-ui/lab/Alert';
import { useAsyncCluster } from '../ClusterDetailsPage/useCurrentCluster';
import {
  App,
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

const PageContent = ({
  isLoading,
  error,
  installationName,
  cluster,
  clusterApp,
  isGSUser,
  children,
}: {
  isLoading: boolean;
  error: Error | null;
  installationName: string;
  cluster?: Cluster;
  clusterApp?: App;
  isGSUser?: boolean;
  children?: React.ReactNode;
}) => {
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

  if (isLoading) {
    return (
      <Content>
        <Progress />
      </Content>
    );
  }

  if (error) {
    return (
      <Content>
        {clusterApp ? (
          <ClusterAppStatus
            installationName={installationName}
            name={clusterApp.metadata.name}
            namespace={clusterApp.metadata.namespace ?? ''}
          />
        ) : (
          <Alert severity="error">{error.toString()}</Alert>
        )}
      </Content>
    );
  }

  return <RoutedTabs routes={routes} />;
};

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

  return (
    <Page themeId="service">
      <Header
        title={name}
        subtitle={cluster ? getClusterDescription(cluster) : undefined}
        type="resource - kubernetes cluster"
      />
      <PageContent
        isLoading={isLoading}
        error={error}
        installationName={installationName}
        cluster={cluster}
        clusterApp={clusterApp}
        isGSUser={isGSUser}
      >
        {children}
      </PageContent>
    </Page>
  );
};

ClusterLayout.Route = Route;
