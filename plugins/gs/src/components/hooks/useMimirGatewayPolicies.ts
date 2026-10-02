import { useMemo } from 'react';
import { useMimirQuery } from './useMimirQuery';
import { sanitizePromQLValue } from './promql';
import { MimirMetricSample, MimirQueryResponse } from '../../apis/mimir/types';
import { buildGatewayPolicies, policyMetrics } from './gatewayPolicies';

function samplesOf(
  response: MimirQueryResponse | undefined,
): MimirMetricSample[] {
  return response?.data?.result ?? [];
}

function optionalSamplesOf(
  data: MimirQueryResponse | undefined,
  error: unknown,
): MimirMetricSample[] | undefined {
  return error ? undefined : samplesOf(data);
}

/**
 * One selector for a metric across all policy kinds. The names come from the
 * metrics registry; a regex on `__name__` keeps it to one query per metric
 * instead of one per kind.
 */
function selectorFor(names: string[], clusterName: string): string {
  return `{__name__=~"${names.join('|')}",cluster_id="${sanitizePromQLValue(
    clusterName,
  )}"}`;
}

const infoNames = policyMetrics.map(m => m.info);
const targetInfoNames = policyMetrics.map(m => m.targetInfo);
const ancestorAcceptedNames = policyMetrics.map(m => m.ancestorAccepted);

/**
 * Fetches the Envoy Gateway policies of one cluster from Mimir, with their
 * targets and the Accepted condition per ancestor.
 *
 * The policy list is required; a failure there is the hook's `error`. Targets
 * and status only enrich it: if their queries fail, status is reported as not
 * available instead of blocking the view.
 */
export function useMimirGatewayPolicies(options: {
  installationName: string;
  clusterName: string | undefined;
  refetchInterval?: number | false;
}) {
  const { installationName, clusterName, refetchInterval } = options;
  const enabled = Boolean(clusterName);
  const common = { installationName, enabled, refetchInterval };

  const info = useMimirQuery({
    ...common,
    query: selectorFor(infoNames, clusterName ?? ''),
  });
  const targetInfo = useMimirQuery({
    ...common,
    query: selectorFor(targetInfoNames, clusterName ?? ''),
  });
  const ancestorAccepted = useMimirQuery({
    ...common,
    query: selectorFor(ancestorAcceptedNames, clusterName ?? ''),
  });

  const isLoading =
    info.isLoading || targetInfo.isLoading || ancestorAccepted.isLoading;

  const policies = useMemo(
    () =>
      buildGatewayPolicies({
        info: samplesOf(info.data),
        targetInfo: optionalSamplesOf(targetInfo.data, targetInfo.error),
        ancestorAccepted: optionalSamplesOf(
          ancestorAccepted.data,
          ancestorAccepted.error,
        ),
      }),
    [
      info.data,
      targetInfo.data,
      targetInfo.error,
      ancestorAccepted.data,
      ancestorAccepted.error,
    ],
  );

  return { policies, isLoading, error: info.error };
}
