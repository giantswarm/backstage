import { countNoun, joinNames } from '@giantswarm/backstage-plugin-ui-react';

import type {
  ClusterWriteResult,
  ObjectAction,
} from '../../lib/clusterManager';

/**
 * How often the dialog asks cluster-manager, by a dry run, whether another
 * pass of the removal would remove something: helm-controller's uninstall of
 * a small cluster takes about five minutes, so the check is a few seconds
 * behind its end at most.
 */
export const REMOVAL_CHECK_INTERVAL_MS = 15_000;

/** One `delete_cluster` call in mode apply, and the button that made it. */
export type RemovalPass = {
  label: string;
  result: ClusterWriteResult;
  at: Date;
};

/** What one pass did, against the passes before it in the dialog. */
export type PassSummary = {
  /** Deleted for the first time. */
  removed: ObjectAction[];
  /** Deleted again: an earlier pass's delete is still running (the object is terminating). */
  stillGoing: ObjectAction[];
};

/** What the dry run after a pass says about the next one. */
export type NextPass =
  /** Another pass removes objects no pass has removed yet. */
  | { state: 'ready'; objects: ObjectAction[] }
  /** Nothing new to remove yet: what cluster-manager waits for. */
  | { state: 'waiting'; reason: string }
  /** Nothing new to remove and no step named: what is left is not cluster-manager's to remove. */
  | { state: 'stuck'; warnings: string[] };

const DELETED = 'deleted';
const WOULD_DELETE = 'would-delete';

const keyOf = (object: ObjectAction) =>
  `${object.kind}/${object.namespace}/${object.name}`;

/** `HelmRelease org-acme/demo1`. */
export function describeObject(object: ObjectAction): string {
  return object.namespace
    ? `${object.kind} ${object.namespace}/${object.name}`
    : `${object.kind} ${object.name}`;
}

/** `HelmRelease org-acme/demo1, OCIRepository org-acme/demo1`, at most five named. */
export function describeObjects(objects: readonly ObjectAction[]): string {
  return joinNames(objects.map(describeObject));
}

/** The objects the passes deleted, by kind, namespace and name. */
function removedKeys(passes: readonly RemovalPass[]): Set<string> {
  return new Set(
    passes.flatMap(pass =>
      pass.result.objects
        .filter(object => object.action === DELETED)
        .map(keyOf),
    ),
  );
}

/**
 * What the pass at `index` removed: an object an earlier pass deleted already
 * is still going (cluster-manager deletes a terminating object again and
 * answers `deleted`), not removed anew.
 */
export function summarizePass(
  passes: readonly RemovalPass[],
  index: number,
): PassSummary {
  const before = removedKeys(passes.slice(0, index));
  const deleted = passes[index].result.objects.filter(
    object => object.action === DELETED,
  );
  return {
    removed: deleted.filter(object => !before.has(keyOf(object))),
    stillGoing: deleted.filter(object => before.has(keyOf(object))),
  };
}

/**
 * Judges the dry run of the next pass against the passes made: it is worth
 * running when it would delete an object no pass has deleted yet. Otherwise
 * the reason to wait is cluster-manager's next step — the dry run's, or the
 * last pass's while the objects it deleted are still going.
 */
export function judgeNextPass(
  check: ClusterWriteResult,
  passes: readonly RemovalPass[],
): NextPass {
  const removed = removedKeys(passes);
  const wouldDelete = check.objects.filter(
    object => object.action === WOULD_DELETE,
  );
  const fresh = wouldDelete.filter(object => !removed.has(keyOf(object)));
  if (fresh.length > 0) {
    return { state: 'ready', objects: fresh };
  }
  const reason =
    check.nextStep ??
    (wouldDelete.length > 0 ? passes.at(-1)?.result.nextStep : undefined) ??
    (wouldDelete.length > 0
      ? `${countNoun(wouldDelete.length, 'object')} ${
          wouldDelete.length === 1 ? 'is' : 'are'
        } still being removed: ${describeObjects(wouldDelete)}.`
      : undefined);
  return reason
    ? { state: 'waiting', reason }
    : { state: 'stuck', warnings: check.warnings ?? [] };
}

/** `14:03:12`, in the person's locale. */
export function formatClock(at: Date): string {
  return at.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
