import type { KubernetesApi } from '@backstage/plugin-kubernetes-react';
import {
  ConfigMap,
  getK8sGetPath,
  HelmRelease,
  Kustomization,
  OCIRepository,
} from '@giantswarm/backstage-plugin-kubernetes-react';

import type { ObjectAction } from '../../lib/clusterManager';
import {
  groupOf,
  objectKey,
  type RemovalState,
  type RemovalStates,
} from './removalPasses';

/**
 * How long one read of an object may take before it is given up on (and its
 * request aborted): a slow Kubernetes proxy must not hold the dialog's check
 * back, nor pile up requests check after check.
 */
export const BEING_REMOVED_READ_TIMEOUT_MS = 10_000;

/**
 * The kinds `delete_cluster` deletes: the cluster's HelmRelease, its
 * OCIRepository and values ConfigMap, the kserve backend ConfigMaps, the
 * leftover HelmReleases and OCIRepositories, and the cluster's own
 * Kustomization after a merged removal (giantswarm/cluster-manager
 * `internal/tools/cluster_delete.go`).
 */
const KINDS = [HelmRelease, OCIRepository, Kustomization, ConfigMap];

/** The object's path on the installation's API, at the version cluster-manager read it; none for another kind. */
export function objectPath(object: ObjectAction): string | undefined {
  const group = groupOf(object);
  const Kind = KINDS.find(
    candidate =>
      candidate.kind === object.kind &&
      (candidate.isCore ? group === '' : candidate.group === group),
  );
  if (!Kind) {
    return undefined;
  }
  const version = object.apiVersion.split('/').at(-1)!;
  return getK8sGetPath(
    { ...Kind.getGVK(), apiVersion: version },
    object.name,
    object.namespace || undefined,
  );
}

type LiveObject = {
  metadata?: { deletionTimestamp?: string };
  spec?: { kubeConfig?: unknown; suspend?: boolean };
};

/**
 * What another pass would do to the object, by what the person reads of it:
 *
 * - `live`: its deletion was not requested (`metadata.deletionTimestamp`), so
 *   a delete of it is a removal anew;
 * - `going`: it was, and a delete again changes nothing;
 * - `needs-pass`: it was, but it is a HelmRelease that installs into the
 *   cluster through a kubeconfig Secret and is not suspended. cluster-manager
 *   suspends such a release before its delete, so helm-controller skips the
 *   uninstall that cannot reach the gone cluster and lets the release go
 *   (giantswarm/cluster-manager#210): a pass still helps.
 */
export function removalStateOf(
  object: ObjectAction,
  live: LiveObject,
): RemovalState {
  if (!live.metadata?.deletionTimestamp) {
    return 'live';
  }
  const unsuspendedIntoCluster =
    object.kind === HelmRelease.kind &&
    Boolean(live.spec?.kubeConfig) &&
    live.spec?.suspend !== true;
  return unsuspendedIntoCluster ? 'needs-pass' : 'going';
}

async function readOne(
  kubernetesApi: Pick<KubernetesApi, 'proxy'>,
  installation: string,
  object: ObjectAction,
  timeoutMs: number,
): Promise<RemovalState | undefined> {
  const path = objectPath(object);
  if (!path) {
    return undefined;
  }
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<undefined>(resolve => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(undefined);
    }, timeoutMs);
  });
  const read = (async () => {
    try {
      const response = await kubernetesApi.proxy({
        clusterName: installation,
        path,
        init: { signal: controller.signal },
      });
      return response.ok
        ? removalStateOf(object, await response.json())
        : undefined;
    } catch {
      return undefined;
    }
  })();
  try {
    return await Promise.race([read, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Reads, as the person on the installation's API, the objects a dry run would
 * delete whose state is not known to be `going` already: a deletion once
 * requested stays so while the object exists, so those are not asked again.
 * Answers the state of each object read, by its key ({@link objectKey}). An
 * object that cannot be read — not allowed, gone, of another kind, too slow —
 * is not in the answer: what was known of it stays, and an object never read
 * counts as a removal anew, as without the read.
 */
export async function readRemovalStates(
  kubernetesApi: Pick<KubernetesApi, 'proxy'>,
  installation: string,
  objects: readonly ObjectAction[],
  known: RemovalStates,
  timeoutMs: number = BEING_REMOVED_READ_TIMEOUT_MS,
): Promise<RemovalStates> {
  const toRead = objects.filter(
    object =>
      object.action === 'would-delete' &&
      known.get(objectKey(object)) !== 'going',
  );
  const states = await Promise.all(
    toRead.map(object =>
      readOne(kubernetesApi, installation, object, timeoutMs),
    ),
  );
  const read = new Map<string, RemovalState>();
  toRead.forEach((object, index) => {
    const state = states[index];
    if (state) {
      read.set(objectKey(object), state);
    }
  });
  return read;
}

/**
 * The states known after a dry run and its reads: each object read takes its
 * new state (one deleted and made again reads `live`), the others keep theirs,
 * and an object the dry run no longer lists is gone and forgotten — made
 * again, it is read anew.
 */
export function mergeRemovalStates(
  known: RemovalStates,
  listed: readonly ObjectAction[],
  read: RemovalStates,
): RemovalStates {
  const present = new Set(listed.map(object => objectKey(object)));
  const merged = new Map<string, RemovalState>();
  for (const [key, state] of known) {
    if (present.has(key)) {
      merged.set(key, state);
    }
  }
  for (const [key, state] of read) {
    merged.set(key, state);
  }
  return merged;
}
