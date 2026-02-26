import { useMemo } from 'react';
import { useMimirQuery } from './useMimirQuery';
import { MimirQueryResponse } from '../../apis/mimir/types';
import {
  KubePodContainerStatusWaitingReason,
  KubePodContainerStatusTerminatedReason,
  KubePodContainerStatusRestartsTotal,
  KubePodStatusPhase,
  KubeDeploymentStatusCondition,
} from '../../apis/mimir/metrics';

export interface WorkloadDiagnostics {
  waitingReasons: { pod: string; container: string; reason: string }[];
  terminatedReasons: { pod: string; container: string; reason: string }[];
  restarts: { container: string; count: number }[];
  podPhases: { phase: string; count: number }[];
  conditions: { condition: string; status: string }[];
  isLoading: boolean;
  error: Error | null;
}

function extractReasons(
  response: MimirQueryResponse | undefined,
  reasonLabel: string,
): { pod: string; container: string; reason: string }[] {
  const results = response?.data?.result;
  if (!results) return [];

  return results.map(sample => ({
    pod: sample.metric.pod ?? '',
    container: sample.metric.container ?? '',
    reason: sample.metric[reasonLabel] ?? '',
  }));
}

function extractRestarts(
  response: MimirQueryResponse | undefined,
): { container: string; count: number }[] {
  const results = response?.data?.result;
  if (!results) return [];

  return results
    .map(sample => ({
      container: sample.metric.container ?? '',
      count: parseFloat(sample.value[1]),
    }))
    .filter(r => !isNaN(r.count) && r.count > 0);
}

function extractPodPhases(
  response: MimirQueryResponse | undefined,
): { phase: string; count: number }[] {
  const results = response?.data?.result;
  if (!results) return [];

  return results
    .map(sample => ({
      phase: sample.metric.phase ?? '',
      count: parseFloat(sample.value[1]),
    }))
    .filter(r => !isNaN(r.count) && r.count > 0);
}

function extractConditions(
  response: MimirQueryResponse | undefined,
): { condition: string; status: string }[] {
  const results = response?.data?.result;
  if (!results) return [];

  return results.map(sample => ({
    condition: sample.metric.condition ?? '',
    status: sample.metric.status ?? '',
  }));
}

export function useMimirWorkloadDiagnostics(options: {
  installationName: string;
  clusterName: string | undefined;
  namespace: string | undefined;
  name: string;
  kind: string;
  enabled?: boolean;
}): WorkloadDiagnostics {
  const {
    installationName,
    clusterName,
    namespace,
    name,
    kind,
    enabled = true,
  } = options;

  const isEnabled = Boolean(enabled && clusterName && namespace && name);
  const podSelector = `cluster_id="${clusterName}",namespace="${namespace}",pod=~"${name}-.*"`;

  const waitingQuery = `${KubePodContainerStatusWaitingReason.name}{${podSelector}} == 1`;
  const terminatedQuery = `${KubePodContainerStatusTerminatedReason.name}{${podSelector}} == 1`;
  const restartsQuery = `sum by (container) (${KubePodContainerStatusRestartsTotal.name}{${podSelector}})`;
  const phasesQuery = `count by (phase) (${KubePodStatusPhase.name}{${podSelector}} == 1)`;
  const conditionsQuery = `${KubeDeploymentStatusCondition.name}{cluster_id="${clusterName}",namespace="${namespace}",deployment="${name}"} == 1`;

  const {
    data: waitingData,
    isLoading: waitingLoading,
    error: waitingError,
  } = useMimirQuery({
    installationName,
    query: waitingQuery,
    enabled: isEnabled,
  });

  const {
    data: terminatedData,
    isLoading: terminatedLoading,
    error: terminatedError,
  } = useMimirQuery({
    installationName,
    query: terminatedQuery,
    enabled: isEnabled,
  });

  const {
    data: restartsData,
    isLoading: restartsLoading,
    error: restartsError,
  } = useMimirQuery({
    installationName,
    query: restartsQuery,
    enabled: isEnabled,
  });

  const {
    data: phasesData,
    isLoading: phasesLoading,
    error: phasesError,
  } = useMimirQuery({
    installationName,
    query: phasesQuery,
    enabled: isEnabled,
  });

  const {
    data: conditionsData,
    isLoading: conditionsLoading,
    error: conditionsError,
  } = useMimirQuery({
    installationName,
    query: conditionsQuery,
    enabled: isEnabled && kind === 'deployment',
  });

  return useMemo(
    () => ({
      waitingReasons: extractReasons(waitingData, 'reason'),
      terminatedReasons: extractReasons(terminatedData, 'reason'),
      restarts: extractRestarts(restartsData),
      podPhases: extractPodPhases(phasesData),
      conditions: extractConditions(conditionsData),
      isLoading:
        waitingLoading ||
        terminatedLoading ||
        restartsLoading ||
        phasesLoading ||
        (kind === 'deployment' && conditionsLoading),
      error:
        waitingError ||
        terminatedError ||
        restartsError ||
        phasesError ||
        conditionsError,
    }),
    [
      waitingData,
      terminatedData,
      restartsData,
      phasesData,
      conditionsData,
      waitingLoading,
      terminatedLoading,
      restartsLoading,
      phasesLoading,
      conditionsLoading,
      waitingError,
      terminatedError,
      restartsError,
      phasesError,
      conditionsError,
      kind,
    ],
  );
}
