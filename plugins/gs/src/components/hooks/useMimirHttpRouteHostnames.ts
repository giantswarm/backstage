import { useMemo } from 'react';
import { useMimirQuery } from './useMimirQuery';
import { MimirMetricSample, MimirQueryResponse } from '../../apis/mimir/types';
import {
  CertmanagerCertificateExpirationTimestampSeconds,
  CertmanagerCertificateReadyStatus,
  GatewayApiGatewayListenerInfo,
  GatewayApiHttprouteHostnameInfo,
  GatewayApiHttprouteParentInfo,
} from '../../apis/mimir/metrics';
import { HostnameCertInfo, resolveHostnameCert } from './resolveHostnameCert';

export interface HttpRouteHostname {
  /** The hostname exposed by the HTTPRoute (the `hostname` label). */
  hostname: string;
  /** All labels of the series, exposed verbatim for debugging/filtering. */
  labels: Record<string, string>;
  /** The serving TLS certificate, resolved via the Gateway listener. */
  cert?: HostnameCertInfo;
}

function samplesOf(
  response: MimirQueryResponse | undefined,
): MimirMetricSample[] {
  return response?.data?.result ?? [];
}

/**
 * Groups the raw series by `hostname` and merges their labels. The same
 * hostname can be exposed by several HTTPRoutes (e.g. a route and its
 * companion HTTP→HTTPS redirect route), producing one series each. For each
 * label, values that agree collapse to a single value; values that differ
 * across the merged series are joined (e.g. `name` becomes a comma-separated
 * list of route names), so no debugging detail is lost.
 */
function extractHostnames(samples: MimirMetricSample[]): HttpRouteHostname[] {
  const byHostname = new Map<string, Record<string, Set<string>>>();
  for (const sample of samples) {
    const hostname = sample.metric.hostname ?? '';
    let labelSets = byHostname.get(hostname);
    if (!labelSets) {
      labelSets = {};
      byHostname.set(hostname, labelSets);
    }
    for (const [key, value] of Object.entries(sample.metric)) {
      (labelSets[key] ??= new Set()).add(value);
    }
  }

  return Array.from(byHostname.entries())
    .map(([hostname, labelSets]) => {
      const labels: Record<string, string> = {};
      for (const [key, values] of Object.entries(labelSets)) {
        labels[key] = Array.from(values).sort().join(', ');
      }
      return { hostname, labels };
    })
    .sort((a, b) => a.hostname.localeCompare(b.hostname));
}

/**
 * Fetches the hostnames exposed by Gateway API HTTPRoutes in the workload's
 * target namespace, and enriches each with its serving TLS certificate.
 *
 * The metric carries no backendRef, so hostnames are narrowed to the workload
 * via `cluster_id` + `namespace`. Certificates are resolved by walking
 * HTTPRoute → Gateway listener → cert-manager Certificate (see
 * `resolveHostnameCert`). The full label set is surfaced per series so the
 * filtering can be verified.
 */
export function useMimirHttpRouteHostnames(options: {
  installationName: string;
  clusterName: string | undefined;
  namespace: string | undefined;
  refetchInterval?: number | false;
}) {
  const { installationName, clusterName, namespace, refetchInterval } = options;

  const isEnabled = Boolean(clusterName && namespace);
  const nsSelector = `cluster_id="${clusterName}",namespace="${namespace}"`;
  const clusterSelector = `cluster_id="${clusterName}"`;

  const hostnamesQuery = `${GatewayApiHttprouteHostnameInfo.name}{${nsSelector}}`;
  const parentsQuery = `${GatewayApiHttprouteParentInfo.name}{${nsSelector}}`;
  const listenersQuery = `${GatewayApiGatewayListenerInfo.name}{${clusterSelector}}`;
  const expirationQuery = `${CertmanagerCertificateExpirationTimestampSeconds.name}{${clusterSelector}}`;
  const readyQuery = `${CertmanagerCertificateReadyStatus.name}{${clusterSelector}}`;

  const {
    data: hostnamesData,
    isLoading,
    error,
  } = useMimirQuery({
    installationName,
    query: hostnamesQuery,
    enabled: isEnabled,
    refetchInterval,
  });

  // Certificate-resolution queries. These only enrich the result — failures or
  // slowness here must not block rendering the hostnames themselves.
  const { data: parentsData } = useMimirQuery({
    installationName,
    query: parentsQuery,
    enabled: isEnabled,
    refetchInterval,
  });
  const { data: listenersData } = useMimirQuery({
    installationName,
    query: listenersQuery,
    enabled: isEnabled,
    refetchInterval,
  });
  const { data: expirationData } = useMimirQuery({
    installationName,
    query: expirationQuery,
    enabled: isEnabled,
    refetchInterval,
  });
  const { data: readyData } = useMimirQuery({
    installationName,
    query: readyQuery,
    enabled: isEnabled,
    refetchInterval,
  });

  return useMemo(() => {
    const hostnameSamples = samplesOf(hostnamesData);
    const inputs = {
      hostnameSamples,
      parentSamples: samplesOf(parentsData),
      listenerSamples: samplesOf(listenersData),
      expirationSamples: samplesOf(expirationData),
      readySamples: samplesOf(readyData),
    };

    const hostnames = extractHostnames(hostnameSamples).map(entry => ({
      ...entry,
      cert: resolveHostnameCert(entry.hostname, inputs),
    }));

    return { hostnames, isLoading, error };
  }, [
    hostnamesData,
    parentsData,
    listenersData,
    expirationData,
    readyData,
    isLoading,
    error,
  ]);
}
