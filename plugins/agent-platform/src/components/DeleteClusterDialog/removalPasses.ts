import { formatLocalTimeWithSeconds } from '@giantswarm/backstage-plugin-ui-react';
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

/**
 * What another pass would do to an object a dry run would delete, as the
 * person reads it (`beingRemoved.ts`): `live` — its deletion was not requested,
 * a delete is a removal anew; `going` — it was, a delete again changes
 * nothing; `needs-pass` — it was, but a pass would still suspend it so that
 * helm-controller lets it go (giantswarm/cluster-manager#210).
 */
export type RemovalState = 'live' | 'going' | 'needs-pass';

/** The states known of the objects, by their key ({@link objectKey}); an object not in it was never read. */
export type RemovalStates = ReadonlyMap<string, RemovalState>;

/** One `delete_cluster` call in mode apply, and the button that made it. */
export type RemovalPass = {
  label: string;
  result: ClusterWriteResult;
  at: Date;
  /**
   * What was read of the objects before the pass started: a delete of one
   * `going` is not a removal anew — after the dialog was reopened, too, when
   * no earlier pass of this opening deleted it — and the delete of one that
   * `needs-pass` is, though an earlier pass deleted it.
   */
  states: RemovalStates;
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

/** An object's API group: empty for the core group (`v1`). */
export function groupOf(object: Pick<ObjectAction, 'apiVersion'>): string {
  return object.apiVersion.includes('/') ? object.apiVersion.split('/')[0] : '';
}

/** An object's identity: its API group (not its version), kind, namespace and name. */
export function objectKey(object: ObjectAction): string {
  return `${groupOf(object)}/${object.kind}/${object.namespace}/${object.name}`;
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
    passes.flatMap(pass => pass.result.objects.filter(isDelete).map(objectKey)),
  );
}

/**
 * Whether a delete of the object is one again, of an object still terminating:
 * read as `going`, or deleted by a pass already — unless it was read as
 * needing the pass.
 */
function deletedAgain(
  object: ObjectAction,
  removed: ReadonlySet<string>,
  states: RemovalStates,
): boolean {
  const state = states.get(objectKey(object));
  if (state === 'needs-pass') {
    return false;
  }
  return state === 'going' || removed.has(objectKey(object));
}

/**
 * What the pass at `index` removed: an object an earlier pass deleted already,
 * or one read as being removed before the pass, is still going
 * (cluster-manager deletes a terminating object again and answers `delete`),
 * not removed anew — unless it was read as needing the pass.
 */
export function summarizePass(
  passes: readonly RemovalPass[],
  index: number,
): PassSummary {
  const before = removedKeys(passes.slice(0, index));
  const { result, states } = passes[index];
  const going = (object: ObjectAction) => deletedAgain(object, before, states);
  const deleted = result.objects.filter(isDelete);
  const others = result.objects.filter(object => !isDelete(object));
  return {
    removed: deleted.filter(object => !going(object)),
    stillGoing: deleted.filter(going),
    others,
    changed: others.filter(
      object => object.action !== UNCHANGED && object.action !== PENDING_ACTION,
    ),
  };
}

/**
 * Judges the dry run of the next pass against the passes made and the states
 * read of its objects: it is worth running when it would change anything but
 * delete again an object a pass deleted already or one read as `going`
 * (which is still terminating) — one read as needing the pass is worth it.
 * Otherwise the reason to wait is cluster-manager's next step — the dry
 * run's, or the last pass's while the objects it deleted are still going.
 */
export function judgeNextPass(
  check: ClusterWriteResult,
  passes: readonly RemovalPass[],
  states: RemovalStates = new Map(),
): NextPass {
  const removed = removedKeys(passes);
  const again = (object: ObjectAction) =>
    object.action === WOULD_DELETE && deletedAgain(object, removed, states);
  const fresh = check.objects.filter(
    object => object.action.startsWith(WOULD) && !again(object),
  );
  if (fresh.length > 0) {
    return { state: 'ready', objects: fresh };
  }
  const going = check.objects.filter(again);
  // The last pass's next step speaks of what it deleted; an object it did not
  // delete (being removed since before this opening) is named instead.
  const last = passes.at(-1);
  const lastDeleted = removedKeys(last ? [last] : []);
  const lastSpeaksOfThem =
    going.length > 0 &&
    going.every(object => lastDeleted.has(objectKey(object)));
  const reason =
    check.nextStep ??
    (lastSpeaksOfThem ? last?.result.nextStep : undefined) ??
    (going.length > 0
      ? `${objectsAre(going)} still being removed: ${describeObjects(going)}.`
      : undefined);
  return reason
    ? { state: 'waiting', reason }
    : { state: 'stuck', warnings: check.warnings ?? [] };
}

/** `14:03:12`, in the person's locale. */
export function formatClock(at: Date): string {
  return formatLocalTimeWithSeconds(at);
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
