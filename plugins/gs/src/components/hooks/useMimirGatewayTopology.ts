import { useMemo } from 'react';
import { useMimirQuery } from './useMimirQuery';
import { clusterMetricsSelector } from './promql';
import {
  GatewayApiGatewayInfo,
  GatewayApiGatewayListenerInfo,
  GatewayApiGatewayStatus,
  GatewayApiGatewayStatusListenerAttachedRoutes,
  GatewayApiHttprouteHostnameInfo,
  GatewayApiHttprouteParentInfo,
  GatewayApiHttprouteRuleBackendInfo,
  GatewayApiHttprouteStatusParentAccepted,
  GatewayApiHttprouteStatusParentInfo,
  GatewayApiHttprouteStatusParentResolvedRefs,
} from '@giantswarm/backstage-plugin-gs-common';
import { buildGatewayTopology } from '../utils/gatewayTopology';
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
 *
 * One query per metric rather than one for all of them: on a busy cluster a
 * single metric can exceed Mimir's per-query limits, and then only what it
 * enriches is lost.
 */
export function useMimirGatewayTopology(options: {
  installationName: string;
  clusterName: string | undefined;
  refetchInterval?: number | false;
}) {
  const { installationName, clusterName, refetchInterval } = options;

  const enabled = Boolean(clusterName);
  const common = { installationName, enabled, refetchInterval };
  const queryOf = (metric: { name: string }) =>
    clusterMetricsSelector([metric.name], clusterName ?? '');

  const gatewayInfo = useMimirQuery({
    ...common,
    query: queryOf(GatewayApiGatewayInfo),
  });
  const gatewayStatus = useMimirQuery({
    ...common,
    query: queryOf(GatewayApiGatewayStatus),
  });
  const listenerInfo = useMimirQuery({
    ...common,
    query: queryOf(GatewayApiGatewayListenerInfo),
  });
  const listenerAttachedRoutes = useMimirQuery({
    ...common,
    query: queryOf(GatewayApiGatewayStatusListenerAttachedRoutes),
  });
  const routeParentInfo = useMimirQuery({
    ...common,
    query: queryOf(GatewayApiHttprouteParentInfo),
  });
  const routeHostnameInfo = useMimirQuery({
    ...common,
    query: queryOf(GatewayApiHttprouteHostnameInfo),
  });
  const routeStatusParentInfo = useMimirQuery({
    ...common,
    query: queryOf(GatewayApiHttprouteStatusParentInfo),
  });
  const routeAccepted = useMimirQuery({
    ...common,
    query: queryOf(GatewayApiHttprouteStatusParentAccepted),
  });
  const routeResolvedRefs = useMimirQuery({
    ...common,
    query: queryOf(GatewayApiHttprouteStatusParentResolvedRefs),
  });
  const routeRuleBackendInfo = useMimirQuery({
    ...common,
    query: queryOf(GatewayApiHttprouteRuleBackendInfo),
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
    routeResolvedRefs.isLoading ||
    routeRuleBackendInfo.isLoading;
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
        routeRuleBackendInfo: optionalSamplesOf(
          routeRuleBackendInfo.data,
          routeRuleBackendInfo.error,
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
      routeRuleBackendInfo.data,
      routeRuleBackendInfo.error,
    ],
  );

  return { ...topology, isLoading, error };
}
