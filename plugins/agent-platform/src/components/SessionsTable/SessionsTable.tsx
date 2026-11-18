import type { FleetSessionStatesView } from '../../hooks/useFleetSessionStates';
import type { SessionRow } from '../SessionsDataProvider/helpers';
import { ShellSessionsTable } from './ShellSessionsTable';

export { RUNTIME_LOST_LABEL, RUNTIME_LOST_TITLE } from './cells';

/** Columns an embedding page may drop because its context already implies them. */
export type HideableSessionColumn = 'agentName' | 'installation';

export type SessionsTableProps = {
  rows: SessionRow[];
  /**
   * Derived state per session, from `useFleetSessionStates`. The State column is
   * rendered only when this is given: a table with no states to show is better
   * without the column than with one full of dashes.
   */
  sessionStates?: FleetSessionStatesView;
  /** True only while no rows exist yet, so the skeleton replaces the table. */
  isLoading?: boolean;
  /** Search debounce; set to 0 in tests so typing takes effect immediately. */
  searchDebounceMs?: number;
  /**
   * Columns to leave out. For an agent's own sessions the agent and installation
   * are fixed by the surrounding page, so repeating them in every row is noise.
   */
  hideColumns?: ReadonlyArray<HideableSessionColumn>;
  /** Replaces the default "No sessions found." message. */
  emptyMessage?: string;
};

/**
 * The sessions list: rows grouped by the day they started, the shell's state
 * words and a row menu, with search and filters from `SEARCH_MIN` sessions on (see
 * `ShellSessionsTable`).
 *
 * The page owns the loading indicator for incremental fleet loading and the
 * per-installation notices; this renders rows, the search field, and the empty
 * state.
 */
export const SessionsTable = ShellSessionsTable;
