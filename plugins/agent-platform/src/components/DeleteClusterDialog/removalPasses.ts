import { countNoun, joinNames } from '@giantswarm/backstage-plugin-ui-react';

import {
  PENDING_ACTION,
  type ClusterWriteResult,
  type ObjectAction,
} from '../../lib/clusterManager';

/**
 * How often the dialog asks cluster-manager, by a dry run, whether another
 * pass of the removal would remove something: helm-controller's uninstall of
 * a small cluster takes about five minutes, so the check is a few seconds
 * behind its end at most.
 */
export const REMOVAL_CHECK_INTERVAL_MS = 15_000;

/**
 * How long the dialog keeps checking while there is nothing new to do: far
 * past a small cluster's uninstall, so a dialog left open does not ask
 * cluster-manager for good. **Check again** starts another round.
 */
export const REMOVAL_CHECK_WINDOW_MS = 30 * 60_000;

/** The checks of one round: {@link REMOVAL_CHECK_WINDOW_MS} at {@link REMOVAL_CHECK_INTERVAL_MS}. */
export const REMOVAL_CHECK_LIMIT =
  REMOVAL_CHECK_WINDOW_MS / REMOVAL_CHECK_INTERVAL_MS;

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
  /** Every other object the answer lists, with its action (`update`, `unchanged`, `pending`, …). */
  others: ObjectAction[];
  /** Of `others`, those the pass changed: neither `unchanged` nor `pending`. */
  changed: ObjectAction[];
};

/** What the dry run after a pass says about the next one. */
export type NextPass =
  /** Another pass would change objects: delete one no pass has deleted yet, or anything else. */
  | { state: 'ready'; objects: ObjectAction[] }
  /** Nothing new to remove yet: what cluster-manager waits for. */
  | { state: 'waiting'; reason: string }
  /** Nothing new to remove and no step named: what is left is not cluster-manager's to remove. */
  | { state: 'stuck'; warnings: string[] };

/**
 * A delete a pass made: cluster-manager answers `delete` (the verb of its
 * applied actions: `create`, `update`, `delete`); `deleted` is kept for the
 * past-tense form the type also allows.
 */
const DELETES = new Set(['delete', 'deleted']);
const isDelete = (object: ObjectAction) => DELETES.has(object.action);
const UNCHANGED = 'unchanged';
const WOULD = 'would-';
const WOULD_DELETE = `${WOULD}delete`;

/** An object's identity: its API group (not its version), kind, namespace and name. */
function keyOf(object: ObjectAction): string {
  const group = object.apiVersion.includes('/')
    ? object.apiVersion.split('/')[0]
    : '';
  return `${group}/${object.kind}/${object.namespace}/${object.name}`;
}

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

/** `1 object is`, `3 objects are`. */
export function objectsAre(objects: readonly unknown[]): string {
  return `${countNoun(objects.length, 'object')} ${
    objects.length === 1 ? 'is' : 'are'
  }`;
}

/** The objects the passes deleted, by kind, namespace and name. */
function removedKeys(passes: readonly RemovalPass[]): Set<string> {
  return new Set(
    passes.flatMap(pass => pass.result.objects.filter(isDelete).map(keyOf)),
  );
}

/**
 * What the pass at `index` removed: an object an earlier pass deleted already
 * is still going (cluster-manager deletes a terminating object again and
 * answers `delete`), not removed anew.
 */
export function summarizePass(
  passes: readonly RemovalPass[],
  index: number,
): PassSummary {
  const before = removedKeys(passes.slice(0, index));
  const { objects } = passes[index].result;
  const deleted = objects.filter(isDelete);
  const others = objects.filter(object => !isDelete(object));
  return {
    removed: deleted.filter(object => !before.has(keyOf(object))),
    stillGoing: deleted.filter(object => before.has(keyOf(object))),
    others,
    changed: others.filter(
      object => object.action !== UNCHANGED && object.action !== PENDING_ACTION,
    ),
  };
}

/**
 * Judges the dry run of the next pass against the passes made: it is worth
 * running when it would change anything but delete again an object a pass
 * deleted already (which is still terminating). Otherwise
 * the reason to wait is cluster-manager's next step — the dry run's, or the
 * last pass's while the objects it deleted are still going.
 */
export function judgeNextPass(
  check: ClusterWriteResult,
  passes: readonly RemovalPass[],
): NextPass {
  const removed = removedKeys(passes);
  const again = (object: ObjectAction) =>
    object.action === WOULD_DELETE && removed.has(keyOf(object));
  const fresh = check.objects.filter(
    object => object.action.startsWith(WOULD) && !again(object),
  );
  if (fresh.length > 0) {
    return { state: 'ready', objects: fresh };
  }
  const going = check.objects.filter(again);
  const reason =
    check.nextStep ??
    (going.length > 0 ? passes.at(-1)?.result.nextStep : undefined) ??
    (going.length > 0
      ? `${objectsAre(going)} still being removed: ${describeObjects(going)}.`
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

/** `HelmRelease org-acme/demo1`, with the action a dry run names when it is not a delete: `(would-update)`. */
export function describeNextObject(object: ObjectAction): string {
  return object.action === WOULD_DELETE
    ? describeObject(object)
    : `${describeObject(object)} (${object.action})`;
}

/** Whether every object of a ready pass would be deleted. */
export function onlyDeletes(objects: readonly ObjectAction[]): boolean {
  return objects.every(object => object.action === WOULD_DELETE);
}
