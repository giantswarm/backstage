import { Grid } from '@material-ui/core';
import {
  EntityAboutCard,
  EntityDependsOnComponentsCard,
  EntityDependsOnResourcesCard,
  EntityHasSystemsCard,
  EntityLayout,
  EntityLinksCard,
  EntityOrphanWarning,
  EntityProcessingErrorsPanel,
  EntitySwitch,
  hasCatalogProcessingErrors,
  isComponentType,
  isKind,
  isOrphan,
} from '@backstage/plugin-catalog';
import {
  isGithubActionsAvailable,
  EntityGithubActionsContent,
} from '@backstage-community/plugin-github-actions';
import {
  EntityUserProfileCard,
  EntityGroupProfileCard,
  EntityMembersListCard,
  EntityOwnershipCard,
} from '@backstage/plugin-org';
import { FeatureFlagged } from '@backstage/core-app-api';
import { EmptyState } from '@backstage/core-components';
import {
  Direction,
  EntityCatalogGraphCard,
} from '@backstage/plugin-catalog-graph';
import {
  EntityCircleCIContent,
  isCircleCIAvailable,
} from '@backstage/plugin-circleci';
import { EntityGithubPullRequestsContent } from '@roadiehq/backstage-plugin-github-pull-requests';
import {
  Entity,
  RELATION_API_CONSUMED_BY,
  RELATION_API_PROVIDED_BY,
  RELATION_CONSUMES_API,
  RELATION_DEPENDENCY_OF,
  RELATION_DEPENDS_ON,
  RELATION_HAS_PART,
  RELATION_PART_OF,
  RELATION_PROVIDES_API,
} from '@backstage/catalog-model';

import {
  EntityGrafanaDashboardsCard,
  isDashboardSelectorAvailable,
} from '@k-phoen/backstage-plugin-grafana';

import { EntityKubernetesContent } from '@backstage/plugin-kubernetes';
import {
  EntityGSDeploymentsContent,
  EntityGSKratixResourcesContent,
  EntityGSInstallationDetailsCard,
  EntityGSKratixStatusCard,
  isEntityGSInstallationResource,
  isEntityGSKratixResource,
  isEntityGSDeploymentsAvailable,
  EntityGSAppDeploymentCard,
  EntityGSVersionHistoryContent,
  isEntityGSVersionHistoryAvailable,
} from '@giantswarm/backstage-plugin-gs';

function isLinksAvailable(entity: Entity) {
  if (entity?.metadata?.links?.length) {
    return true;
  }
  return false;
}

function isDeployable(entity: Entity) {
  const tags = entity?.metadata?.tags ?? [];

  return tags.includes('helmchart-deployable');
}

const circleCIContent = (
  <EntitySwitch>
    <EntitySwitch.Case if={isCircleCIAvailable}>
      <EntityCircleCIContent />
    </EntitySwitch.Case>

    <EntitySwitch.Case>
      <EmptyState
        title="CircleCI not available for this entity"
        missing="info"
        description="Once the repository has a '.circleci.com/config.yml' file, information on CircleCI job runs will be displayed here."
      />
    </EntitySwitch.Case>
  </EntitySwitch>
);

const githubActionsContent = (
  // This is an example of how you can implement your company's logic in entity page.
  // You can for example enforce that all components of type 'service' should use GitHubActions
  <EntitySwitch>
    <EntitySwitch.Case if={isGithubActionsAvailable}>
      <EntityGithubActionsContent />
    </EntitySwitch.Case>

    <EntitySwitch.Case>
      <EmptyState
        title="GitHub Actions not available for this entity"
        missing="info"
        description="There appears to be no GitHub repository information for this component. That should not happen normally. Please report this problem. Thanks!"
      />
    </EntitySwitch.Case>
  </EntitySwitch>
);

const entityWarningContent = (
  <>
    <EntitySwitch>
      <EntitySwitch.Case if={isOrphan}>
        <Grid item xs={12}>
          <EntityOrphanWarning />
        </Grid>
      </EntitySwitch.Case>
    </EntitySwitch>

    <EntitySwitch>
      <EntitySwitch.Case if={hasCatalogProcessingErrors}>
        <Grid item xs={12}>
          <EntityProcessingErrorsPanel />
        </Grid>
      </EntitySwitch.Case>
    </EntitySwitch>
  </>
);

const overviewContent = (
  <Grid container spacing={3} alignItems="stretch">
    {entityWarningContent}
    <Grid item md={8}>
      <EntityAboutCard variant="gridItem" />
    </Grid>

    <Grid item md={4} xs={12}>
      <Grid container spacing={3} alignItems="stretch">
        <EntitySwitch>
          <EntitySwitch.Case if={isDeployable}>
            <Grid item xs={12}>
              <EntityGSAppDeploymentCard />
            </Grid>
          </EntitySwitch.Case>
        </EntitySwitch>
        <EntitySwitch>
          <EntitySwitch.Case if={isLinksAvailable}>
            <Grid item xs={12}>
              <EntityLinksCard />
            </Grid>
          </EntitySwitch.Case>
        </EntitySwitch>
      </Grid>
    </Grid>

    <Grid item md={12} xs={12}>
      <EntityCatalogGraphCard variant="gridItem" height={400} />
    </Grid>
  </Grid>
);

const baseEntityPage = (
  <EntityLayout>
    <EntityLayout.Route path="/" title="Overview">
      {overviewContent}
    </EntityLayout.Route>
  </EntityLayout>
);

const appcatalogEntityPage = (
  <EntityLayout>
    <EntityLayout.Route path="/" title="Overview">
      {overviewContent}
    </EntityLayout.Route>

    <EntityLayout.Route path="/dependencies" title="Dependencies">
      <Grid container spacing={3} alignItems="stretch">
        <Grid item md={12}>
          <EntityDependsOnComponentsCard variant="gridItem" />
        </Grid>
        <Grid item md={12}>
          <EntityDependsOnResourcesCard variant="gridItem" />
        </Grid>
      </Grid>
    </EntityLayout.Route>
  </EntityLayout>
);

const componentEntityPage = (
  <EntityLayout>
    <EntityLayout.Route path="/" title="Overview">
      {overviewContent}
    </EntityLayout.Route>

    <EntityLayout.Route
      if={isEntityGSDeploymentsAvailable}
      path="/deployments"
      title="Deployments"
    >
      <EntityGSDeploymentsContent />
    </EntityLayout.Route>

    <EntityLayout.Route
      if={isEntityGSVersionHistoryAvailable}
      path="/version-history"
      title="Version History"
    >
      <EntityGSVersionHistoryContent />
    </EntityLayout.Route>

    <FeatureFlagged with="show-kubernetes-resources">
      <EntityLayout.Route path="/kubernetes" title="Kubernetes">
        <EntityKubernetesContent refreshIntervalMs={30000} />
      </EntityLayout.Route>
    </FeatureFlagged>

    <EntityLayout.Route path="/pull-requests" title="Pull Requests">
      <EntityGithubPullRequestsContent />
    </EntityLayout.Route>

    <EntityLayout.Route path="/github-actions" title="GitHub Actions">
      {githubActionsContent}
    </EntityLayout.Route>

    <EntityLayout.Route
      if={isCircleCIAvailable}
      path="/circleci"
      title="CircleCI"
    >
      {circleCIContent}
    </EntityLayout.Route>

    <EntityLayout.Route path="/dependencies" title="Dependencies">
      <Grid container spacing={3} alignItems="stretch">
        <Grid item md={12}>
          <p>
            Here we show only dependencies that are also included in the
            catalog. Use the GitHub dependencies page under <b>Insights</b> /{' '}
            <b>Dependency graph</b> for a more complete overview.
          </p>
        </Grid>
        <Grid item md={12}>
          <EntityDependsOnComponentsCard
            title="Dependencies of this component"
            variant="gridItem"
          />
        </Grid>
        <Grid item md={12}>
          <EntityDependsOnResourcesCard variant="gridItem" />
        </Grid>
      </Grid>
    </EntityLayout.Route>
  </EntityLayout>
);

/**
 * NOTE: This page is designed to work on small screens such as mobile devices.
 * This is based on Material UI Grid. If breakpoints are used, each grid item must set the `xs` prop to a column size or to `true`,
 * since this does not default. If no breakpoints are used, the items will equitably share the available space.
 * https://material-ui.com/components/grid/#basic-grid.
 */

const defaultEntityPage = (
  <EntityLayout>
    <EntityLayout.Route path="/" title="Overview">
      {overviewContent}
    </EntityLayout.Route>

    <EntityLayout.Route path="/pull-requests" title="Pull Requests">
      <EntityGithubPullRequestsContent />
    </EntityLayout.Route>

    <EntityLayout.Route path="/github-actions" title="GitHub Actions">
      {githubActionsContent}
    </EntityLayout.Route>

    <EntityLayout.Route
      if={isCircleCIAvailable}
      path="/circleci"
      title="CircleCI"
    >
      {circleCIContent}
    </EntityLayout.Route>

    <EntityLayout.Route path="/dependencies" title="Dependencies">
      <Grid container spacing={3} alignItems="stretch">
        <Grid item md={12}>
          <p>
            Here we show only dependencies that are also included in the
            catalog. Use the GitHub dependencies page under <b>Insights</b> /{' '}
            <b>Dependency graph</b> for a more complete overview.
          </p>
        </Grid>
        <Grid item md={12}>
          <EntityDependsOnComponentsCard
            title="Dependencies of this component"
            variant="gridItem"
          />
        </Grid>
        <Grid item md={12}>
          <EntityDependsOnResourcesCard variant="gridItem" />
        </Grid>
      </Grid>
    </EntityLayout.Route>
  </EntityLayout>
);

const componentPage = (
  <EntitySwitch>
    <EntitySwitch.Case if={isComponentType('customer')}>
      {baseEntityPage}
    </EntitySwitch.Case>
    <EntitySwitch.Case if={isComponentType('template')}>
      {baseEntityPage}
    </EntitySwitch.Case>
    <EntitySwitch.Case if={isComponentType('appcatalog')}>
      {appcatalogEntityPage}
    </EntitySwitch.Case>

    <EntitySwitch.Case>{componentEntityPage}</EntitySwitch.Case>
  </EntitySwitch>
);

const apiPage = (
  <EntityLayout>
    <EntityLayout.Route path="/" title="Overview">
      <Grid container spacing={3}>
        {entityWarningContent}
        <Grid item md={6}>
          <EntityAboutCard />
        </Grid>
        <Grid item md={6} xs={12}>
          <EntityCatalogGraphCard variant="gridItem" height={400} />
        </Grid>
      </Grid>
    </EntityLayout.Route>
  </EntityLayout>
);

const userPage = (
  <EntityLayout>
    <EntityLayout.Route path="/" title="Overview">
      <Grid container spacing={3}>
        {entityWarningContent}
        <Grid item xs={12} md={6}>
          <EntityUserProfileCard variant="gridItem" />
        </Grid>
        <Grid item xs={12} md={6}>
          <EntityOwnershipCard variant="gridItem" />
        </Grid>
      </Grid>
    </EntityLayout.Route>
  </EntityLayout>
);

const groupPage = (
  <EntityLayout>
    <EntityLayout.Route path="/" title="Overview">
      <Grid container spacing={3}>
        {entityWarningContent}

        <Grid item xs={12}>
          <EntityGroupProfileCard variant="gridItem" />
        </Grid>

        <Grid item xs={12}>
          <EntityOwnershipCard variant="gridItem" />
        </Grid>

        <Grid item xs={12}>
          <EntityMembersListCard />
        </Grid>

        <EntitySwitch>
          <EntitySwitch.Case if={e => !!isDashboardSelectorAvailable(e)}>
            <Grid item xs={12}>
              <EntityGrafanaDashboardsCard title="Grafana Cloud dashboards" />
            </Grid>
          </EntitySwitch.Case>
        </EntitySwitch>
      </Grid>
    </EntityLayout.Route>
  </EntityLayout>
);

const systemPage = (
  <EntityLayout>
    <EntityLayout.Route path="/" title="Overview">
      <Grid container spacing={3} alignItems="stretch">
        {entityWarningContent}
        <Grid item md={6}>
          <EntityAboutCard variant="gridItem" />
        </Grid>
        <Grid item md={6} xs={12}>
          <EntityCatalogGraphCard variant="gridItem" height={400} />
        </Grid>
      </Grid>
    </EntityLayout.Route>
    <EntityLayout.Route path="/diagram" title="Diagram">
      <EntityCatalogGraphCard
        variant="gridItem"
        direction={Direction.TOP_BOTTOM}
        title="System Diagram"
        height={700}
        relations={[
          RELATION_PART_OF,
          RELATION_HAS_PART,
          RELATION_API_CONSUMED_BY,
          RELATION_API_PROVIDED_BY,
          RELATION_CONSUMES_API,
          RELATION_PROVIDES_API,
          RELATION_DEPENDENCY_OF,
          RELATION_DEPENDS_ON,
        ]}
        unidirectional={false}
      />
    </EntityLayout.Route>
  </EntityLayout>
);

const domainPage = (
  <EntityLayout>
    <EntityLayout.Route path="/" title="Overview">
      <Grid container spacing={3} alignItems="stretch">
        {entityWarningContent}
        <Grid item md={6}>
          <EntityAboutCard variant="gridItem" />
        </Grid>
        <Grid item md={6} xs={12}>
          <EntityCatalogGraphCard variant="gridItem" height={400} />
        </Grid>
        <Grid item md={6}>
          <EntityHasSystemsCard variant="gridItem" />
        </Grid>
      </Grid>
    </EntityLayout.Route>
  </EntityLayout>
);

const resourcePage = (
  <EntityLayout>
    <EntityLayout.Route path="/" title="Overview">
      <Grid container spacing={2} alignItems="flex-start">
        {entityWarningContent}

        <Grid item xs={12} md={8}>
          <EntityAboutCard variant="gridItem" />
        </Grid>

        <EntitySwitch>
          <EntitySwitch.Case if={isEntityGSKratixResource}>
            <Grid item xs={12} md={4}>
              <EntityGSKratixStatusCard />
            </Grid>
          </EntitySwitch.Case>
        </EntitySwitch>
        <EntitySwitch>
          <EntitySwitch.Case if={isLinksAvailable}>
            <Grid item xs={12} md={4}>
              <EntityLinksCard cols={1} />
            </Grid>
          </EntitySwitch.Case>
        </EntitySwitch>

        <EntitySwitch>
          <EntitySwitch.Case if={isEntityGSInstallationResource}>
            <Grid item xs={12} md={8}>
              <EntityGSInstallationDetailsCard />
            </Grid>
          </EntitySwitch.Case>
        </EntitySwitch>
      </Grid>
    </EntityLayout.Route>
    <EntityLayout.Route
      path="/kratix-resources"
      title="Kratix Resources"
      if={isEntityGSKratixResource}
    >
      <EntityGSKratixResourcesContent />
    </EntityLayout.Route>
  </EntityLayout>
);

export const entityPage = (
  <EntitySwitch>
    <EntitySwitch.Case if={isKind('component')} children={componentPage} />
    <EntitySwitch.Case if={isKind('api')} children={apiPage} />
    <EntitySwitch.Case if={isKind('group')} children={groupPage} />
    <EntitySwitch.Case if={isKind('user')} children={userPage} />
    <EntitySwitch.Case if={isKind('system')} children={systemPage} />
    <EntitySwitch.Case if={isKind('domain')} children={domainPage} />
    <EntitySwitch.Case if={isKind('resource')} children={resourcePage} />

    <EntitySwitch.Case>{defaultEntityPage}</EntitySwitch.Case>
  </EntitySwitch>
);
