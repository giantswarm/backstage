import { ReactElement, ReactNode } from 'react';
import { Content, EmptyState, Progress } from '@backstage/core-components';
import {
  attachComponentData,
  useElementFilter,
} from '@backstage/core-plugin-api';
import { useRouteRefParams } from '@backstage/frontend-plugin-api';
import { Alert as BuiAlert, Flex, PluginHeader } from '@backstage/ui';
import StorageIcon from '@material-ui/icons/Storage';
import { TabProps } from '@material-ui/core/Tab';
import Alert from '@material-ui/lab/Alert';
import { useAsyncCluster } from '../ClusterDetailsPage/useCurrentCluster';
import { clusterDetailsRouteRef } from '../../../routes';
import { useCurrentUser, useLayoutTabs } from '../../hooks';
import { ClusterAppStatus } from './ClusterAppStatus';
import { ClusterDeletingNotice } from './ClusterDeletingNotice';
import {
  App,
  Cluster,
  HelmRelease,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { AIChatButtonBui } from '@giantswarm/backstage-plugin-ai-chat-react';
import { calculateClusterStatus } from '../utils';
import { ClusterStatuses } from '../ClusterStatus';

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
  notFound,
  clusterName,
  installationName,
  error,
  refreshError,
  cluster,
  isDeleting,
  installer,
  element,
}: {
  isLoading: boolean;
  notFound: boolean;
  clusterName: string;
  installationName: string;
  error: Error | null;
  refreshError: Error | null;
  cluster?: Cluster;
  isDeleting: boolean;
  installer?: App | HelmRelease;
  element: ReactNode;
}) => {
  if (isLoading) {
    return (
      <Content>
        <Progress />
      </Content>
    );
  }

  if (notFound) {
    return (
      <Content>
        <EmptyState
          missing="data"
          title="Cluster not found"
          description={`Installation "${installationName}" has no cluster named "${clusterName}" in this namespace. The cluster may have been deleted, or this installation doesn't manage clusters at all.`}
        />
      </Content>
    );
  }

  if (error) {
    return (
      <Content>
        {installer ? (
          <ClusterAppStatus installer={installer} />
        ) : (
          <Alert severity="error">{error.toString()}</Alert>
        )}
      </Content>
    );
  }

  return (
    <Content>
      {cluster && isDeleting ? (
        <ClusterDeletingNotice cluster={cluster} refreshError={refreshError} />
      ) : null}
      {!isDeleting && refreshError ? (
        <BuiAlert
          status="warning"
          icon
          mb="4"
          title="Could not re-read the cluster"
          description={`The page shows the cluster as last read and keeps trying: ${refreshError.message}`}
        />
      ) : null}
      {element}
    </Content>
  );
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
  /**
   * Header actions other plugins attach. They render while the cluster loads
   * and after it is gone too, reading it with `useClusterPageTarget`.
   */
  actions?: ReactElement[];
}

export const ClusterLayout = ({
  children,
  actions = [],
}: ClusterLayoutProps) => {
  const { name } = useRouteRefParams(clusterDetailsRouteRef);

  const {
    cluster,
    clusterApp,
    clusterRelease,
    installationName,
    isDeleting,
    loading: clusterIsLoading,
    notFound,
    error: error,
    refreshError,
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
            },
          ];
        }),
    [cluster, isLoading, isGSUser],
  );

  const { tabs, element } = useLayoutTabs(routes);

  return (
    <>
      <PluginHeader
        icon={<StorageIcon fontSize="inherit" />}
        title={`Clusters / ${name}`}
        tabs={tabs}
        customActions={
          // The actions stay mounted once the cluster is gone, so a dialog
          // an action opened can see its flow through.
          <Flex gap="2" align="center">
            {actions}
            {cluster ? (
              <AIChatButtonBui
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
            ) : null}
          </Flex>
        }
      />
      <PageContent
        isLoading={isLoading}
        notFound={notFound}
        clusterName={name}
        installationName={installationName}
        error={error}
        refreshError={refreshError}
        cluster={cluster}
        isDeleting={isDeleting}
        installer={clusterApp ?? clusterRelease}
        element={element}
      />
    </>
  );
};

ClusterLayout.Route = Route;
