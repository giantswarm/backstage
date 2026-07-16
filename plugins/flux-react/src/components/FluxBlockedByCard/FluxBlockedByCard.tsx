import { useMemo } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Typography } from '@material-ui/core';
import { Alert } from '@backstage/ui';
import { Link } from '@backstage/core-components';
import { ExternalRouteRef, useRouteRef } from '@backstage/frontend-plugin-api';
import {
  App,
  HelmRelease,
  Kustomization,
  useResources,
  useShowErrors,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  ConditionMessage,
  useDetailsPane,
} from '@giantswarm/backstage-plugin-ui-react';
import {
  BlockedAncestor,
  findBlockedAncestors,
  selectBlockingRootCause,
} from '../../utils/findKustomizationAncestors';
import { isManagedByFlux } from '../../utils/isManagedByFlux';
import {
  FLUX_RESOURCE_PANE_ID,
  FLUX_RESOURCE_PANE_PREFIX,
} from '../FluxResourcesTreeView/constants';

const KUSTOMIZATIONS_STALE_TIME_MS = 60_000;

function formatKustomizationRef(kustomization: Kustomization) {
  return `${kustomization.getNamespace()}/${kustomization.getName()}`;
}

type FluxBlockedByCardProps = {
  deployment: App | HelmRelease;
  installationName: string;
  fluxOverviewRouteRef: ExternalRouteRef;
};

/**
 * Warns when an ancestor Flux Kustomization of the given deployment is
 * suspended or failing and therefore blocking updates to the deployment.
 * Renders nothing for deployments that are not managed by Flux, while
 * loading, and when the whole chain is healthy.
 */
export function FluxBlockedByCard({
  deployment,
  installationName,
  fluxOverviewRouteRef,
}: FluxBlockedByCardProps) {
  const isGitOpsManaged = isManagedByFlux(deployment);

  const {
    resources: kustomizations,
    errors,
    isLoading,
  } = useResources(
    installationName,
    Kustomization,
    {},
    { enabled: isGitOpsManaged, staleTime: KUSTOMIZATIONS_STALE_TIME_MS },
  );

  useShowErrors(errors);

  const blockedAncestors = useMemo(
    () =>
      isGitOpsManaged ? findBlockedAncestors(deployment, kustomizations) : [],
    [isGitOpsManaged, deployment, kustomizations],
  );

  const fluxOverviewRoute = useRouteRef(fluxOverviewRouteRef);
  const { getRoute } = useDetailsPane(FLUX_RESOURCE_PANE_ID, {
    prefix: FLUX_RESOURCE_PANE_PREFIX,
  });

  const rootCause = selectBlockingRootCause(blockedAncestors);
  if (!isGitOpsManaged || isLoading || !rootCause) {
    return null;
  }

  const rootCauseKustomization = rootCause.kustomization;

  let rootCauseUrl: string | null = null;
  if (fluxOverviewRoute) {
    const paneRoute = getRoute(fluxOverviewRoute(), {
      cluster: installationName,
      kind: Kustomization.kind.toLowerCase(),
      name: rootCauseKustomization.getName(),
      namespace: rootCauseKustomization.getNamespace(),
    });
    // Add the cluster filter the tree page's cluster picker reads, reusing
    // the query string getRoute produced so everything stays encoded.
    const [panePath, paneQuery = ''] = paneRoute.split('?');
    const params = new URLSearchParams(paneQuery);
    params.set('cluster', installationName);
    rootCauseUrl = `${panePath}?${params.toString()}`;
  }

  const alsoBlocked = blockedAncestors.filter(blocked => blocked !== rootCause);

  return (
    <Alert
      status="warning"
      icon
      title="Deployment updates blocked"
      description={
        <>
          <Typography variant="body2">
            Kustomization {formatKustomizationRef(rootCauseKustomization)}{' '}
            {rootCause.reason === 'suspended'
              ? 'is suspended, so changes to this deployment are not applied.'
              : `is failing, so changes to this deployment are not applied${
                  rootCause.message ? ':' : '.'
                }`}
          </Typography>
          {rootCause.message ? (
            <Box mt={1}>
              <ConditionMessage message={rootCause.message} />
            </Box>
          ) : null}
          {alsoBlocked.length > 0 ? (
            <Box mt={1}>
              <Typography variant="body2">
                Also blocked in the chain:{' '}
                {alsoBlocked
                  .map(({ kustomization }: BlockedAncestor) =>
                    formatKustomizationRef(kustomization),
                  )
                  .join(', ')}
              </Typography>
            </Box>
          ) : null}
          {rootCauseUrl ? (
            <Box mt={1}>
              <Link component={RouterLink} to={rootCauseUrl}>
                View in Flux overview
              </Link>
            </Box>
          ) : null}
        </>
      }
    />
  );
}
