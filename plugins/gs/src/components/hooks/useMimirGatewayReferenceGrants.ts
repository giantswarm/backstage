import { useMemo } from 'react';
import { useMimirQuery } from './useMimirQuery';
import { clusterMetricsSelector } from './promql';
import {
  buildReferenceGrants,
  referenceGrantMetricNames,
} from '../utils/gatewayReferenceGrants';
import { blockingError, samplesOf } from './mimirSamples';

/**
 * Fetches the Gateway API ReferenceGrants of one cluster from Mimir, with
 * what each lets reference into its namespace. One query reads all three
 * metrics, so a grant and its entries can't disagree.
 */
export function useMimirGatewayReferenceGrants(options: {
  installationName: string;
  clusterName: string | undefined;
  refetchInterval?: number | false;
}) {
  const { installationName, clusterName, refetchInterval } = options;

  const query = useMimirQuery({
    installationName,
    enabled: Boolean(clusterName),
    refetchInterval,
    query: clusterMetricsSelector(referenceGrantMetricNames, clusterName ?? ''),
  });

  const referenceGrants = useMemo(
    () => buildReferenceGrants(samplesOf(query.data)),
    [query.data],
  );

  return {
    referenceGrants,
    isLoading: query.isLoading,
    error: blockingError(query),
  };
}
