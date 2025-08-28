import { Header, Page, RoutedTabs } from '@backstage/core-components';
import {
  attachComponentData,
  useElementFilter,
} from '@backstage/core-plugin-api';
import { TabProps } from '@material-ui/core/Tab';

export type FluxPageLayoutRouteProps = {
  path: string;
  title: string;
  children: JSX.Element;
  tabProps?: TabProps<React.ElementType, { component?: React.ElementType }>;
};

const dataKey = 'plugin.flux.fluxPageLayoutRoute';

const Route: (props: FluxPageLayoutRouteProps) => null = () => null;
attachComponentData(Route, dataKey, true);
attachComponentData(Route, 'core.gatherMountPoints', true);

export interface FluxPageLayoutProps {
  children?: React.ReactNode;
}

export const FluxPageLayout = ({ children }: FluxPageLayoutProps) => {
  const routes = useElementFilter(
    children,
    elements =>
      elements
        .selectByComponentData({
          key: dataKey,
          withStrictError:
            'Child of FluxPageLayout must be a FluxPageLayout.Route',
        })
        .getElements<FluxPageLayoutRouteProps>()
        .flatMap(({ props: elementProps }) => {
          return [
            {
              path: elementProps.path,
              title: elementProps.title,
              children: elementProps.children,
              tabProps: elementProps.tabProps,
            },
          ];
        }),
    [],
  );

  return (
    <Page themeId="service">
      <Header title="Flux Overview" subtitle="Overview of Flux resources" />

      <RoutedTabs routes={routes} />
    </Page>
  );
};

FluxPageLayout.Route = Route;
