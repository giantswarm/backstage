import { useApi } from '@backstage/core-plugin-api';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import type { KubernetesApi } from '@backstage/plugin-kubernetes-react';
import { useQueries } from '@tanstack/react-query';
import { InferenceService } from '@giantswarm/backstage-plugin-kubernetes-react';

/**
 * A verdict changes only when KServe is (un)installed, so keep it warm: the
 * point of the probe is that installations *without* KServe cost one request
 * every few minutes at most, not one per Models-tab visit.
 */
const STALE_TIME = 5 * 60 * 1000;

/** `GET /apis/serving.kserve.io/v1beta1` — the served-version resource list. */
export const KSERVE_PROBE_PATH = `/apis/${InferenceService.group}/${InferenceService.apiVersion}`;

export type KServeProbeResult = {
  installation: string;
  /** Whether the installation serves the InferenceService CRD at all. */
  hasInferenceServices: boolean;
};

/**
 * Whether an installation serves `inferenceservices.serving.kserve.io`, read
 * from API discovery rather than by listing (and 404ing) the resource itself.
 *
 * A missing API group/version answers 404 — a legitimate shape (no KServe), so
 * it resolves to *data* (`false`) and is cached like any answer, rather than
 * becoming an error that react-query would refetch on every mount. A 403 on
 * discovery is treated the same: the user cannot see whether KServe is there,
 * so the section stays hidden for them. Anything else (unreachable, 5xx) is a
 * real failure and throws, so the caller can surface the installation as
 * unreadable.
 */
export async function probeKServe(
  kubernetesApi: KubernetesApi,
  installation: string,
): Promise<KServeProbeResult> {
  const response = await kubernetesApi.proxy({
    clusterName: installation,
    path: KSERVE_PROBE_PATH,
  });

  if (response.status === 404 || response.status === 403) {
    return { installation, hasInferenceServices: false };
  }

  if (!response.ok) {
    // HTTP/2 responses carry no reason phrase; fall back to the status code.
    const reason = response.statusText || `HTTP ${response.status}`;
    const error = new Error(
      `Failed to discover ${InferenceService.group} on ${installation}. Reason: ${reason}.`,
    );
    if (response.status === 401) {
      error.name = 'UnauthorizedError';
    } else if (response.status === 503) {
      error.name = 'ServiceUnavailableError';
    }
    throw error;
  }

  const list: { resources?: { name: string }[] } = await response.json();
  return {
    installation,
    hasInferenceServices: (list.resources ?? []).some(
      resource => resource.name === InferenceService.plural,
    ),
  };
}

export type KServeInstallations = {
  /** Installations (in input order) that serve the InferenceService CRD. */
  installations: string[];
  /** Some probes have not answered yet (the set may still grow). */
  isProbing: boolean;
  /** Probes that failed outright — the installation could not be asked. */
  errors: { installation: string; error: Error }[];
};

/**
 * Narrows installations to those with KServe installed — the gate for the
 * Models tab's Serving section, so portals without a serving layer never
 * list InferenceServices, nodes or pods, and never show the section.
 */
export function useKServeInstallations(
  installations: string[],
): KServeInstallations {
  const kubernetesApi = useApi(kubernetesApiRef);

  return useQueries({
    queries: installations.map(installation => ({
      queryKey: ['agent-platform', 'serving', 'kserve-discovery', installation],
      queryFn: () => probeKServe(kubernetesApi, installation),
      staleTime: STALE_TIME,
    })),
    combine: results => ({
      installations: installations.filter(
        (_, index) => results[index].data?.hasInferenceServices === true,
      ),
      isProbing: results.some(result => result.isLoading),
      errors: installations.flatMap((installation, index) =>
        results[index].isError
          ? [{ installation, error: results[index].error as Error }]
          : [],
      ),
    }),
  });
}
