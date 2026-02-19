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
import { useAsyncDeployment } from '../DeploymentDetailsPage/useCurrentDeployment';
import { deploymentDetailsRouteRef } from '../../../routes';
import { useCurrentUser } from '../../hooks';
import {
  App,
  HelmRelease,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { AIChatButton } from '@giantswarm/backstage-plugin-ai-chat-react';
import { getAggregatedStatus } from '../utils/getStatus';

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

function getAIChatMessage(
  deployment: App | HelmRelease,
  installationName: string,
): { message: string; isTroubleshoot: boolean } {
  const name = deployment.getName();
  const namespace = deployment.getNamespace();
  const kind = deployment instanceof HelmRelease ? 'HelmRelease' : 'App';
  const isTroubleshoot = getAggregatedStatus(deployment) === 'failed';

  const message = isTroubleshoot
    ? `Please read the ${kind} resource named '${name}' in namespace '${namespace}' on management cluster '${installationName}' and help me troubleshoot it.`
    : `Please read the ${kind} resource named '${name}' in namespace '${namespace}' on management cluster '${installationName}', and show me basic details, so that I can ask further questions about it.`;

  return { message, isTroubleshoot };
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

  const isLoading = deploymentIsLoading || currentUserIsLoading;

  const type = `resource - ${deployment && deployment instanceof App ? 'Giant Swarm App' : 'Flux HelmRelease'}`;

  return (
    <Page themeId="service">
      <Header title={name} type={type}>
        {deployment &&
          (() => {
            const { message, isTroubleshoot } = getAIChatMessage(
              deployment,
              installationName,
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
