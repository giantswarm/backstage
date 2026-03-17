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
} from '@backstage/core-plugin-api';
import { useRouteRefParams } from '@backstage/frontend-plugin-api';
import Grid from '@material-ui/core/Grid';
import { makeStyles } from '@material-ui/core/styles';
import { TabProps } from '@material-ui/core/Tab';
import Alert from '@material-ui/lab/Alert';
import { useAsyncDeployment } from '../DeploymentDetailsPage/useCurrentDeployment';
import { deploymentDetailsRouteRef } from '../../../routes';
import { useCurrentUser } from '../../hooks';
import {
  App,
  HelmRelease,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { AIChatButton } from '@giantswarm/backstage-plugin-ai-chat-react';
import { getAggregatedStatus } from '../utils/getStatus';
import {
  useMimirWorkloadStatus,
  WorkloadReplicaStatus,
} from '../../hooks/useMimirWorkloadStatus';
import { findTargetClusterName } from '../utils/findTargetCluster';
import {
  getWorkloadNamespace,
  getWorkloadPodPrefix,
} from '../utils/getWorkloadIdentifiers';
import { EditDeploymentButton } from './EditDeploymentButton';

const useStyles = makeStyles(theme => ({
  headerAction: {
    color: theme.page.fontColor,
  },
}));

export type DeploymentLayoutRouteProps = {
  path: string;
  title: string;
  children: JSX.Element;
  if?: (data: {
    deployment: App | HelmRelease;
    installationName: string;
    isGSUser: boolean;
  }) => boolean;
  tabProps?: TabProps<React.ElementType, { component?: React.ElementType }>;
};

const dataKey = 'plugin.gs.clusterLayoutRoute';

const Route: (props: DeploymentLayoutRouteProps) => null = () => null;
attachComponentData(Route, dataKey, true);
attachComponentData(Route, 'core.gatherMountPoints', true);

const PageContent = ({
  isLoading,
  error,
  installationName,
  deployment,
  isGSUser,
  children,
}: {
  isLoading: boolean;
  error: Error | null;
  installationName: string;
  deployment?: App | HelmRelease;
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
            'Child of DeploymentLayout must be a DeploymentLayout.Route',
        })
        .getElements<DeploymentLayoutRouteProps>()
        .flatMap(({ props: elementProps }) => {
          if (isLoading || !deployment) {
            return [];
          } else if (
            elementProps.if &&
            !elementProps.if({
              deployment,
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
    [deployment, isLoading, isGSUser],
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
        <Alert severity="error">{error.toString()}</Alert>
      </Content>
    );
  }

  return <RoutedTabs routes={routes} />;
};

function isWorkloadReady(w: WorkloadReplicaStatus): boolean {
  return w.readyReplicas >= w.desiredReplicas && w.desiredReplicas > 0;
}

function getAIChatMessage(
  deployment: App | HelmRelease,
  installationName: string,
  workloads: WorkloadReplicaStatus[],
  clusterName: string | undefined,
  workloadNamespace: string,
): { message: string; isTroubleshoot: boolean } {
  const name = deployment.getName();
  const namespace = deployment.getNamespace();
  const kind = deployment instanceof HelmRelease ? 'HelmRelease' : 'App';
  const deploymentFailed = getAggregatedStatus(deployment) === 'failed';
  const notReadyWorkloads = workloads.filter(w => !isWorkloadReady(w));

  if (deploymentFailed) {
    return {
      isTroubleshoot: true,
      message: `Please read the ${kind} resource named '${name}' in namespace '${namespace}' on management cluster '${installationName}' and help me troubleshoot it.`,
    };
  }

  if (notReadyWorkloads.length > 0 && clusterName) {
    const workloadDescriptions = notReadyWorkloads
      .map(
        w =>
          `The ${w.kind} this ${kind} creates, named '${w.name}' in namespace '${workloadNamespace}' on cluster '${clusterName}', is not Ready.`,
      )
      .join('\n\n');

    return {
      isTroubleshoot: true,
      message: `There is a ${kind} resource named '${name}' in namespace '${namespace}' on management cluster '${installationName}'.\n\n${workloadDescriptions} Please investigate the root cause and help mitigating the problem.`,
    };
  }

  return {
    isTroubleshoot: false,
    message: `Please read the ${kind} resource named '${name}' in namespace '${namespace}' on management cluster '${installationName}', and show me basic details, so that I can ask further questions about it.`,
  };
}

export interface DeploymentLayoutProps {
  children?: React.ReactNode;
}

export const DeploymentLayout = ({ children }: DeploymentLayoutProps) => {
  const classes = useStyles();
  const { name } = useRouteRefParams(deploymentDetailsRouteRef);

  const {
    deployment,
    installationName,
    loading: deploymentIsLoading,
    error: error,
  } = useAsyncDeployment();

  const { isGSUser, isLoading: currentUserIsLoading } =
    useCurrentUser(installationName);

  const clusterName = deployment
    ? findTargetClusterName(deployment)
    : undefined;
  const workloadNamespace = deployment ? getWorkloadNamespace(deployment) : '';
  const podPrefix = deployment ? getWorkloadPodPrefix(deployment) : '';

  const { workloads } = useMimirWorkloadStatus({
    installationName,
    clusterName,
    namespace: workloadNamespace,
    podPrefix,
    refetchInterval: 30_000,
  });

  const isLoading = deploymentIsLoading || currentUserIsLoading;

  const type = `resource - ${deployment && deployment instanceof App ? 'Giant Swarm App' : 'Flux HelmRelease'}`;

  return (
    <Page themeId="service">
      <Header title={name} type={type}>
        {deployment && deployment instanceof HelmRelease && (
          <Grid item className={classes.headerAction}>
            <EditDeploymentButton
              deployment={deployment}
              installationName={installationName}
            />
          </Grid>
        )}
        {deployment &&
          (() => {
            const { message, isTroubleshoot } = getAIChatMessage(
              deployment,
              installationName,
              workloads,
              clusterName,
              workloadNamespace,
            );
            return (
              <Grid item className={classes.headerAction}>
                <AIChatButton
                  troubleshoot={isTroubleshoot}
                  items={[{ label: 'AI Chat', message }]}
                />
              </Grid>
            );
          })()}
      </Header>
      <PageContent
        isLoading={isLoading}
        error={error}
        installationName={installationName}
        deployment={deployment}
        isGSUser={isGSUser}
      >
        {children}
      </PageContent>
    </Page>
  );
};

DeploymentLayout.Route = Route;
