import { useMemo } from 'react';
import { useMimirQuery } from './useMimirQuery';
import { sanitizePromQLValue } from './promql';
import { MimirMetricSample } from '../../apis/mimir/types';
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
import {
  GatewayTopologyInputs,
  buildGatewayTopology,
} from '../utils/gatewayTopology';
import { blockingError, samplesOf } from './mimirSamples';

/** The metric behind each input of the topology join. */
const metricByInput: Record<keyof GatewayTopologyInputs, string> = {
  gatewayInfo: GatewayApiGatewayInfo.name,
  gatewayStatus: GatewayApiGatewayStatus.name,
  listenerInfo: GatewayApiGatewayListenerInfo.name,
  listenerAttachedRoutes: GatewayApiGatewayStatusListenerAttachedRoutes.name,
  routeParentInfo: GatewayApiHttprouteParentInfo.name,
  routeHostnameInfo: GatewayApiHttprouteHostnameInfo.name,
  routeStatusParentInfo: GatewayApiHttprouteStatusParentInfo.name,
  routeAccepted: GatewayApiHttprouteStatusParentAccepted.name,
  routeResolvedRefs: GatewayApiHttprouteStatusParentResolvedRefs.name,
};

const inputKeys = Object.keys(metricByInput) as (keyof GatewayTopologyInputs)[];
const metricNames = Object.values(metricByInput);

/** Splits the samples of the combined query into the join's inputs. */
export function toTopologyInputs(
  samples: MimirMetricSample[],
): GatewayTopologyInputs {
  const inputs = Object.fromEntries(
    inputKeys.map(key => [key, [] as MimirMetricSample[]]),
  ) as Record<keyof GatewayTopologyInputs, MimirMetricSample[]>;
  const keyByMetric = new Map(
    inputKeys.map(key => [metricByInput[key], key] as const),
  );
  for (const sample of samples) {
    const key = keyByMetric.get(sample.metric.__name__ ?? '');
    if (key) inputs[key].push(sample);
  }
  return inputs;
}

/**
 * Fetches the Gateway API topology of one cluster from Mimir: Gateways with
 * their listeners, and HTTPRoutes with their parents and conditions.
 *
 * One query covers every metric, split by name on the client, so a refresh is
 * a single round trip and the parts can't be out of step with each other. A
 * failure is the hook's `error` only until the first result; after that, a
 * failed refetch keeps showing the last good result.
 */
export function useMimirGatewayTopology(options: {
  installationName: string;
  clusterName: string | undefined;
  refetchInterval?: number | false;
}) {
  const { installationName, clusterName, refetchInterval } = options;

  const query = useMimirQuery({
    installationName,
    enabled: Boolean(clusterName),
    refetchInterval,
    query: `{__name__=~"${metricNames.join('|')}",cluster_id="${sanitizePromQLValue(
      clusterName ?? '',
    )}"}`,
  });

  const topology = useMemo(
    () => buildGatewayTopology(toTopologyInputs(samplesOf(query.data))),
    [query.data],
  );

  return {
    ...topology,
    isLoading: query.isLoading,
    error: blockingError(query),
  };
}
