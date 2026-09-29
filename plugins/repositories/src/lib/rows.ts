import {
  StatusLabelIntent,
  SyncMark,
  syncMarkIntent,
  syncMarkLegend,
} from '@giantswarm/backstage-plugin-ui-react';
import { InventoryRecord, Lifecycle, RepositoryRow } from '../apis';

/**
 * A row's set-up state as the page names it: the engine's converged state in
 * the manager's words (`converged`, `not converged`, `refused` where the
 * engine refused the declaration), `run pending` while an Align now waits for
 * its run, `unchecked` for a declared repository no check has run through,
 * `undeclared` for one no team file declares, `gone` for one GitHub no
 * longer has.
 */
export type SetupState =
  | 'converged'
  | 'not converged'
  | 'refused'
  | 'run pending'
  | 'unchecked'
  | 'undeclared'
  | 'gone';

/**
 * What the set-up state is read from: the fields of a `list_repositories`
 * row it depends on. A record (`get_repository`) folds into the same fields
 * through {@link setupOf}, so the row's icon and the expanded panel's header
 * read one state from one function.
 */
export type SetupSource = Pick<RepositoryRow, 'team' | 'gone' | 'setup'>;

/**
 * A record's set-up as the manager's listing carries it in a row: converged
 * from the engine's checks; refused where the engine's result is the entry
 * step, an entry the schema refused and no other step ran; the run pending
 * and the check's error as they are; gone where GitHub has no repository;
 * undeclared where no team file has an entry.
 */
export function setupOf(record: InventoryRecord): SetupSource {
  const { checks, checkedAt, checkError, lastRun, pendingRun } = record.setup;
  return {
    team: record.declaration?.team,
    gone: record.reality === null,
    setup: {
      converged: checks?.converged,
      refused: checks?.steps.some(step => step.step === 'entry'),
      checkedAt,
      lastRun: lastRun?.runUrl,
      pendingRun,
      error: checkError,
    },
  };
}

/**
 * The state, decided in this order: gone and undeclared have no set-up to
 * judge; a run pending is about to change the rest; a refused entry is never
 * converged, whatever the engine's result says (its result for a refused
 * entry carries `converged: true` over the entry step alone); then the
 * engine's verdict, and unchecked without one.
 */
export function setupState(row: SetupSource): SetupState {
  if (row.gone) {
    return 'gone';
  }
  if (!row.team) {
    return 'undeclared';
  }
  if (row.setup.pendingRun) {
    return 'run pending';
  }
  if (row.setup.refused) {
    return 'refused';
  }
  if (row.setup.converged === true) {
    return 'converged';
  }
  if (row.setup.converged === false) {
    return 'not converged';
  }
  return 'unchecked';
}

/** The set-up as one glance: the portal's marks, shared with the Installations page. */
export type SetupMark = SyncMark;

/**
 * The mark of a row's set-up: converged is in sync, not converged is not in
 * sync; a run pending or a declared repository not checked yet is not
 * reconciled; an undeclared repository has nothing to set it up (not
 * installed); a refused declaration or a check that could not run is failed;
 * a repository gone from GitHub is unknown.
 */
export function markOf(row: SetupSource): SetupMark {
  switch (setupState(row)) {
    case 'converged':
      return 'in sync';
    case 'not converged':
      return 'not in sync';
    case 'run pending':
      return 'not reconciled';
    case 'unchecked':
      return row.setup.error ? 'failed' : 'not reconciled';
    case 'undeclared':
      return 'not installed';
    case 'refused':
      return 'failed';
    default:
      return 'unknown';
  }
}

/**
 * The intent of a row's set-up where it is a label rather than an icon, the
 * expanded panel's header: coloured as the row's mark.
 */
export const setupIntent = (row: SetupSource): StatusLabelIntent =>
  syncMarkIntent(markOf(row));

/** What each mark means for a repository's set-up, in the tooltip and the legend. */
export const SETUP_GLOSS: Record<SetupMark, string> = {
  'in sync': 'set up as declared',
  'not in sync': 'off its declared set-up',
  'not reconciled': 'not reconciled yet',
  'not installed': 'no declaration sets it up',
  failed: 'the last check failed',
  unknown: 'gone from GitHub',
};

/** The legend of the marks, for the Set-up column's header. */
export const SETUP_LEGEND = syncMarkLegend(SETUP_GLOSS);

/**
 * The words behind a row's icon, and of the panel's header: the state in the
 * manager's words, the gloss, and the manager's reason where the check could
 * not run.
 */
export function setupLabel(row: SetupSource): string {
  const state = setupState(row);
  const label = `${state} · ${SETUP_GLOSS[markOf(row)]}`;
  return state === 'unchecked' && row.setup.error
    ? `${label}: ${row.setup.error}`
    : label;
}

/** Sorting by set-up puts the repositories wanting a look first. */
export const MARK_ORDER: Record<SetupMark, number> = {
  failed: 0,
  'not in sync': 1,
  'not reconciled': 2,
  unknown: 3,
  'not installed': 4,
  'in sync': 5,
};

/**
 * A row's lifecycle as the manager judges it: the declared one, `archived`
 * for a repository archived on GitHub without a declaration saying so, else
 * `active`.
 */
export function lifecycleOf(row: RepositoryRow): Lifecycle | string {
  if (row.archived && !row.lifecycle) {
    return 'archived';
  }
  return row.lifecycle || 'active';
}
