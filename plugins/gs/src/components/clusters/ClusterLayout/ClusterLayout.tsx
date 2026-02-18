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
import Grid from '@material-ui/core/Grid';
import { makeStyles } from '@material-ui/core/styles';
import { TabProps } from '@material-ui/core/Tab';
import Alert from '@material-ui/lab/Alert';
import { useAsyncCluster } from '../ClusterDetailsPage/useCurrentCluster';
import { clusterDetailsRouteRef } from '../../../routes';
import { useCurrentUser } from '../../hooks';
import { ClusterAppStatus } from './ClusterAppStatus';
import { App, Cluster } from '@giantswarm/backstage-plugin-kubernetes-react';
import { AIChatButton } from '@giantswarm/backstage-plugin-ai-chat';
import { calculateClusterStatus, getClusterDescription } from '../utils';
import { ClusterStatuses } from '../ClusterStatus';

const useStyles = makeStyles(theme => ({
  headerAction: {
    color: theme.page.fontColor,
  },
}));

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
          <ClusterAppStatus app={clusterApp} />
        ) : (
          <Alert severity="error">{error.toString()}</Alert>
        )}
      </Content>
    );
  }

  return <RoutedTabs routes={routes} />;
};

function getAIChatMessage(cluster: Cluster, installationName: string): string {
  const name = cluster.getName();
  const namespace = cluster.getNamespace();
  const isTroubleshoot =
    calculateClusterStatus(cluster) !== ClusterStatuses.Ready;

  return isTroubleshoot
    ? `Please read the cluster resource named '${name}' in namespace '${namespace}' on management cluster '${installationName}' and help me troubleshoot it.`
    : `Please read the cluster resource named '${name}' in namespace '${namespace}' on management cluster '${installationName}', and show me basic details, so that I can ask further questions about it.`;
}

export interface ClusterLayoutProps {
  children?: React.ReactNode;
}

export const ClusterLayout = ({ children }: ClusterLayoutProps) => {
  const classes = useStyles();
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
      >
        {cluster && (
          <Grid item className={classes.headerAction}>
            <AIChatButton
              troubleshoot={
                calculateClusterStatus(cluster) !== ClusterStatuses.Ready
              }
              items={[
                {
                  label: 'AI Chat',
                  message: getAIChatMessage(cluster, installationName),
                },
              ]}
            />
          </Grid>
        )}
      </Header>
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
