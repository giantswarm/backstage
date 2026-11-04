import type { KubernetesApi } from '@backstage/plugin-kubernetes-react';
import {
  ConfigMap,
  HelmRelease,
  Kustomization,
  OCIRepository,
} from '@giantswarm/backstage-plugin-kubernetes-react';

import type { ObjectAction } from '../../lib/clusterManager';
import { groupOf, objectKey } from './removalPasses';

/**
 * How long one read of an object may take before it counts as unknown: a
 * slow Kubernetes proxy must not hold the dialog's check back.
 */
export const BEING_REMOVED_READ_TIMEOUT_MS = 10_000;

/**
 * The kinds `delete_cluster` deletes: the cluster's HelmRelease, its
 * OCIRepository and values ConfigMap, the kserve backend ConfigMaps, the
 * leftover HelmReleases and OCIRepositories, and the cluster's own
 * Kustomization after a merged removal (giantswarm/cluster-manager
 * `internal/tools/cluster_delete.go`).
 */
const KINDS = [
  {
    group: HelmRelease.group,
    kind: HelmRelease.kind,
    plural: HelmRelease.plural,
  },
  {
    group: OCIRepository.group,
    kind: OCIRepository.kind,
    plural: OCIRepository.plural,
  },
  {
    group: Kustomization.group,
    kind: Kustomization.kind,
    plural: Kustomization.plural,
  },
  { group: '', kind: ConfigMap.kind, plural: ConfigMap.plural },
];

/** The object's path on the installation's API, at the version cluster-manager read it; none for another kind. */
export function objectPath(object: ObjectAction): string | undefined {
  const group = groupOf(object);
  const known = KINDS.find(
    candidate => candidate.kind === object.kind && candidate.group === group,
  );
  if (!known) {
    return undefined;
  }
  const base = group
    ? `/apis/${object.apiVersion}`
    : `/api/${object.apiVersion}`;
  const namespace = object.namespace
    ? `/namespaces/${encodeURIComponent(object.namespace)}`
    : '';
  return `${base}${namespace}/${known.plural}/${encodeURIComponent(object.name)}`;
}

type LiveObject = {
  metadata?: { deletionTimestamp?: string };
  spec?: { kubeConfig?: unknown; suspend?: boolean };
};

/**
 * Whether another pass would do nothing new to the object: its delete was
 * requested already (`metadata.deletionTimestamp`) and a delete again changes
 * nothing. Not so for a HelmRelease that installs into the cluster through a
 * kubeconfig Secret and is not suspended: cluster-manager suspends it before
 * its delete, so helm-controller skips the uninstall that cannot reach the
 * gone cluster and lets the release go (giantswarm/cluster-manager#210) — a
 * pass does help there.
 */
export function isBeingRemoved(
  object: ObjectAction,
  live: LiveObject,
): boolean {
  if (!live.metadata?.deletionTimestamp) {
    return false;
  }
  return !(
    object.kind === HelmRelease.kind &&
    live.spec?.kubeConfig &&
    live.spec.suspend !== true
  );
}

async function readOne(
  kubernetesApi: Pick<KubernetesApi, 'proxy'>,
  installation: string,
  object: ObjectAction,
): Promise<boolean> {
  const path = objectPath(object);
  if (!path) {
    return false;
  }
  try {
    const response = await kubernetesApi.proxy({
      clusterName: installation,
      path,
    });
    return response.ok && isBeingRemoved(object, await response.json());
  } catch {
    return false;
  }
}

function withinTimeout(read: Promise<boolean>, ms: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<boolean>(resolve => {
    timer = setTimeout(() => resolve(false), ms);
  });
  return Promise.race([read, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Of the objects a dry run would delete, those being removed already, read
 * as the person on the installation's API: their keys
 * ({@link objectKey}). An object that cannot be read — not allowed, gone, of
 * another kind, too slow — is not among them, and counts as a new removal, as
 * without the read.
 */
export async function readBeingRemoved(
  kubernetesApi: Pick<KubernetesApi, 'proxy'>,
  installation: string,
  objects: readonly ObjectAction[],
  timeoutMs: number = BEING_REMOVED_READ_TIMEOUT_MS,
): Promise<ReadonlySet<string>> {
  const deletes = objects.filter(object => object.action === 'would-delete');
  const found = await Promise.all(
    deletes.map(object =>
      withinTimeout(readOne(kubernetesApi, installation, object), timeoutMs),
    ),
  );
  return new Set(
    deletes.filter((_, index) => found[index]).map(object => objectKey(object)),
  );
}
