import { StatusLabelIntent } from '@giantswarm/backstage-plugin-ui-react';
import { Lifecycle, RepositoryRow } from '../apis';

/** A row's set-up state as the page names it. */
export type SetupState = 'converged' | 'not converged' | 'unchecked';

export function setupState(row: RepositoryRow): SetupState {
  if (row.setup.converged === true) {
    return 'converged';
  }
  if (row.setup.converged === false) {
    return 'not converged';
  }
  return 'unchecked';
}

/** What a set-up state means: converged is good, not converged wants a look. */
export const SETUP_INTENT: Record<SetupState, StatusLabelIntent> = {
  converged: 'positive',
  'not converged': 'warning',
  unchecked: 'neutral',
};

/** Sorting by set-up puts the repositories wanting a look first. */
export const SETUP_ORDER: Record<SetupState, number> = {
  'not converged': 0,
  unchecked: 1,
  converged: 2,
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
