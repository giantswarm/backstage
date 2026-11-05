import { useMemo } from 'react';
import { useMimirQuery } from './useMimirQuery';
import { clusterMetricsSelector } from './promql';
import { buildGatewayPolicies, policyMetrics } from '../utils/gatewayPolicies';
import { blockingError, optionalSamplesOf, samplesOf } from './mimirSamples';

const createdNames = policyMetrics.map(m => m.created);
const infoNames = policyMetrics.map(m => m.info);
const targetInfoNames = policyMetrics.map(m => m.targetInfo);
const ancestorAcceptedNames = policyMetrics.map(m => m.ancestorAccepted);

/**
 * Fetches the Envoy Gateway policies of one cluster from Mimir, with their
 * targets and the Accepted condition per ancestor.
 *
 * The policy list (`created`, one series per policy) is required; a failure
 * there is the hook's `error`. Targets and status only enrich it: if their
 * queries fail, status is reported as not available instead of blocking the
 * view.
 */
export function useMimirGatewayPolicies(options: {
  installationName: string;
  clusterName: string | undefined;
  refetchInterval?: number | false;
}) {
  const { installationName, clusterName, refetchInterval } = options;
  const enabled = Boolean(clusterName);
  const common = { installationName, enabled, refetchInterval };

  const created = useMimirQuery({
    ...common,
    query: clusterMetricsSelector(createdNames, clusterName ?? ''),
  });
  const info = useMimirQuery({
    ...common,
    query: clusterMetricsSelector(infoNames, clusterName ?? ''),
  });
  const targetInfo = useMimirQuery({
    ...common,
    query: clusterMetricsSelector(targetInfoNames, clusterName ?? ''),
  });
  const ancestorAccepted = useMimirQuery({
    ...common,
    query: clusterMetricsSelector(ancestorAcceptedNames, clusterName ?? ''),
  });

  const isLoading =
    created.isLoading ||
    info.isLoading ||
    targetInfo.isLoading ||
    ancestorAccepted.isLoading;

  const policies = useMemo(
    () =>
      buildGatewayPolicies({
        created: samplesOf(created.data),
        info: optionalSamplesOf(info.data, info.error),
        targetInfo: optionalSamplesOf(targetInfo.data, targetInfo.error),
        ancestorAccepted: optionalSamplesOf(
          ancestorAccepted.data,
          ancestorAccepted.error,
        ),
      }),
    [
      created.data,
      info.data,
      info.error,
      targetInfo.data,
      targetInfo.error,
      ancestorAccepted.data,
      ancestorAccepted.error,
    ],
  );

  return { policies, isLoading, error: blockingError(created) };
}
