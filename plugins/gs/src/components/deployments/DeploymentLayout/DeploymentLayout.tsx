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
import { useAsyncDeployment } from '../DeploymentDetailsPage/useCurrentDeployment';
import { AppKind, Deployment } from '@giantswarm/backstage-plugin-gs-common';
import { deploymentDetailsRouteRef } from '../../../routes';
import { useCurrentUser } from '../../hooks';

export type DeploymentLayoutRouteProps = {
  path: string;
  title: string;
  children: JSX.Element;
  if?: (data: {
    deployment: Deployment;
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
  deployment?: Deployment;
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

export interface DeploymentLayoutProps {
  children?: React.ReactNode;
}

export const DeploymentLayout = ({ children }: DeploymentLayoutProps) => {
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

  const type = `resource - ${deployment && deployment.kind === AppKind ? 'Giant Swarm App' : 'Flux HelmRelease'}`;

  return (
    <Page themeId="service">
      <Header title={name} type={type} />
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
