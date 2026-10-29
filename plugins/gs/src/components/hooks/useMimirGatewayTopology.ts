import { useMemo } from 'react';
import { useMimirQuery } from './useMimirQuery';
import { sanitizePromQLValue } from './promql';
import {
  GatewayApiGatewayInfo,
  GatewayApiGatewayListenerInfo,
  GatewayApiGatewayStatus,
  GatewayApiGatewayStatusListenerAttachedRoutes,
  GatewayApiHttprouteHostnameInfo,
  GatewayApiHttprouteParentInfo,
  GatewayApiHttprouteStatusParentAccepted,
  GatewayApiHttprouteStatusParentInfo,
  GatewayApiHttprouteStatusParentResolvedRefs,
} from '@giantswarm/backstage-plugin-gs-common';
import { buildGatewayTopology } from './gatewayTopology';
import { blockingError, optionalSamplesOf, samplesOf } from './mimirSamples';

/**
 * Fetches the Gateway API topology of one cluster from Mimir: Gateways with
 * their listeners, and HTTPRoutes with their parents and conditions.
 *
 * The Gateway and route structure is required; a failure there is the hook's
 * `error`. Everything else only enriches the result: if one of those queries
 * fails, what it would have shown is reported as not available instead of
 * blocking the page. All queries count towards `isLoading`, so a half-loaded
 * result is never rendered.
 */
export function useMimirGatewayTopology(options: {
  installationName: string;
  clusterName: string | undefined;
  refetchInterval?: number | false;
}) {
  const { installationName, clusterName, refetchInterval } = options;

  const enabled = Boolean(clusterName);
  const selector = `{cluster_id="${sanitizePromQLValue(clusterName ?? '')}"}`;
  const common = { installationName, enabled, refetchInterval };

  const gatewayInfo = useMimirQuery({
    ...common,
    query: `${GatewayApiGatewayInfo.name}${selector}`,
  });
  const gatewayStatus = useMimirQuery({
    ...common,
    query: `${GatewayApiGatewayStatus.name}${selector}`,
  });
  const listenerInfo = useMimirQuery({
    ...common,
    query: `${GatewayApiGatewayListenerInfo.name}${selector}`,
  });
  const listenerAttachedRoutes = useMimirQuery({
    ...common,
    query: `${GatewayApiGatewayStatusListenerAttachedRoutes.name}${selector}`,
  });
  const routeParentInfo = useMimirQuery({
    ...common,
    query: `${GatewayApiHttprouteParentInfo.name}${selector}`,
  });
  const routeHostnameInfo = useMimirQuery({
    ...common,
    query: `${GatewayApiHttprouteHostnameInfo.name}${selector}`,
  });
  const routeStatusParentInfo = useMimirQuery({
    ...common,
    query: `${GatewayApiHttprouteStatusParentInfo.name}${selector}`,
  });
  const routeAccepted = useMimirQuery({
    ...common,
    query: `${GatewayApiHttprouteStatusParentAccepted.name}${selector}`,
  });
  const routeResolvedRefs = useMimirQuery({
    ...common,
    query: `${GatewayApiHttprouteStatusParentResolvedRefs.name}${selector}`,
  });

  const isLoading =
    gatewayInfo.isLoading ||
    gatewayStatus.isLoading ||
    listenerInfo.isLoading ||
    listenerAttachedRoutes.isLoading ||
    routeParentInfo.isLoading ||
    routeHostnameInfo.isLoading ||
    routeStatusParentInfo.isLoading ||
    routeAccepted.isLoading ||
    routeResolvedRefs.isLoading;
  const error =
    blockingError(gatewayInfo) ??
    blockingError(listenerInfo) ??
    blockingError(routeParentInfo);

  const topology = useMemo(
    () =>
      buildGatewayTopology({
        gatewayInfo: samplesOf(gatewayInfo.data),
        gatewayStatus: optionalSamplesOf(
          gatewayStatus.data,
          gatewayStatus.error,
        ),
        listenerInfo: samplesOf(listenerInfo.data),
        listenerAttachedRoutes: optionalSamplesOf(
          listenerAttachedRoutes.data,
          listenerAttachedRoutes.error,
        ),
        routeParentInfo: samplesOf(routeParentInfo.data),
        routeHostnameInfo: optionalSamplesOf(
          routeHostnameInfo.data,
          routeHostnameInfo.error,
        ),
        routeStatusParentInfo: optionalSamplesOf(
          routeStatusParentInfo.data,
          routeStatusParentInfo.error,
        ),
        routeAccepted: optionalSamplesOf(
          routeAccepted.data,
          routeAccepted.error,
        ),
        routeResolvedRefs: optionalSamplesOf(
          routeResolvedRefs.data,
          routeResolvedRefs.error,
        ),
      }),
    [
      gatewayInfo.data,
      gatewayStatus.data,
      gatewayStatus.error,
      listenerInfo.data,
      listenerAttachedRoutes.data,
      listenerAttachedRoutes.error,
      routeParentInfo.data,
      routeHostnameInfo.data,
      routeHostnameInfo.error,
      routeStatusParentInfo.data,
      routeStatusParentInfo.error,
      routeAccepted.data,
      routeAccepted.error,
      routeResolvedRefs.data,
      routeResolvedRefs.error,
    ],
  );

  return { ...topology, isLoading, error };
}
