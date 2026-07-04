import { ReactNode } from 'react';
import { Content, Progress } from '@backstage/core-components';
import {
  attachComponentData,
  useElementFilter,
} from '@backstage/core-plugin-api';
import { useRouteRefParams } from '@backstage/frontend-plugin-api';
import { PluginHeader } from '@backstage/ui';
import StorageIcon from '@material-ui/icons/Storage';
import { TabProps } from '@material-ui/core/Tab';
import Alert from '@material-ui/lab/Alert';
import { useAsyncCluster } from '../ClusterDetailsPage/useCurrentCluster';
import { clusterDetailsRouteRef } from '../../../routes';
import { useCurrentUser, useLayoutTabs } from '../../hooks';
import { ClusterAppStatus } from './ClusterAppStatus';
import { App, Cluster } from '@giantswarm/backstage-plugin-kubernetes-react';
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
  error,
  clusterApp,
  element,
}: {
  isLoading: boolean;
  error: Error | null;
  clusterApp?: App;
  element: ReactNode;
}) => {
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

  return <Content>{element}</Content>;
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
          cluster ? (
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
          ) : undefined
        }
      />
      <PageContent
        isLoading={isLoading}
        error={error}
        clusterApp={clusterApp}
        element={element}
      />
    </>
  );
};

ClusterLayout.Route = Route;
