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
} from '../../utils/findKustomizationAncestors';
import {
  FLUX_RESOURCE_PANE_ID,
  FLUX_RESOURCE_PANE_PREFIX,
} from '../FluxResourcesTreeView/constants';

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
 * Renders nothing while loading or when the whole chain is healthy.
 */
export function FluxBlockedByCard({
  deployment,
  installationName,
  fluxOverviewRouteRef,
}: FluxBlockedByCardProps) {
  const {
    resources: kustomizations,
    errors,
    isLoading,
  } = useResources(installationName, Kustomization);

  useShowErrors(errors);

  const blockedAncestors = useMemo(
    () => findBlockedAncestors(deployment, kustomizations),
    [deployment, kustomizations],
  );

  const fluxOverviewRoute = useRouteRef(fluxOverviewRouteRef);
  const { getRoute } = useDetailsPane(FLUX_RESOURCE_PANE_ID, {
    prefix: FLUX_RESOURCE_PANE_PREFIX,
  });

  if (isLoading || blockedAncestors.length === 0) {
    return null;
  }

  // The last entry is the topmost blocked ancestor and usually the root cause.
  const rootCause = blockedAncestors[blockedAncestors.length - 1];
  const rootCauseKustomization = rootCause.kustomization;

  const rootCauseUrl = fluxOverviewRoute
    ? `${getRoute(fluxOverviewRoute(), {
        cluster: installationName,
        kind: Kustomization.kind.toLowerCase(),
        name: rootCauseKustomization.getName(),
        namespace: rootCauseKustomization.getNamespace(),
      })}&cluster=${installationName}`
    : null;

  const alsoBlocked = blockedAncestors.slice(0, -1);

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
              : 'is failing, so changes to this deployment are not applied:'}
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
