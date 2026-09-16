import { RepositoryRow } from '../apis';

/** The sortable columns of the Repositories table. */
export type SortColumn =
  | 'repository'
  | 'team'
  | 'lifecycle'
  | 'lastPersonCommit'
  | 'score'
  | 'setup'
  | 'findings'
  | 'age';

export type SortDirection = 'asc' | 'desc';

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

/** The orphan score bands the tiles count. */
export type ScoreBand = 'healthy' | 'watch' | 'orphan';

export function scoreBand(score: number): ScoreBand {
  if (score >= 60) {
    return 'orphan';
  }
  if (score >= 30) {
    return 'watch';
  }
  return 'healthy';
}

/** A row's lifecycle as the tiles count it: the declared one, else `active`. */
export function lifecycleOf(row: RepositoryRow): string {
  if (row.archived && !row.lifecycle) {
    return 'archived';
  }
  return row.lifecycle || 'active';
}

export interface Tiles {
  setup: Record<SetupState, number>;
  score: Record<ScoreBand, number>;
  lifecycle: Record<string, number>;
}

/** Counts per set-up state, score band and lifecycle over the listed rows. */
export function countTiles(rows: RepositoryRow[]): Tiles {
  const tiles: Tiles = {
    setup: { converged: 0, 'not converged': 0, unchecked: 0 },
    score: { healthy: 0, watch: 0, orphan: 0 },
    lifecycle: {},
  };
  for (const row of rows) {
    tiles.setup[setupState(row)]++;
    tiles.score[scoreBand(row.orphan.score)]++;
    const lifecycle = lifecycleOf(row);
    tiles.lifecycle[lifecycle] = (tiles.lifecycle[lifecycle] ?? 0) + 1;
  }
  return tiles;
}

const SETUP_ORDER: Record<SetupState, number> = {
  'not converged': 0,
  unchecked: 1,
  converged: 2,
};

const UNIT_SECONDS: Record<string, number> = { h: 3600, m: 60, s: 1, ms: 0 };

/** Go durations sort by their length; `5m3s` < `2h`. */
export function durationSeconds(age: string | undefined): number {
  if (!age) {
    return Number.POSITIVE_INFINITY;
  }
  let seconds = 0;
  for (const [, value, unit] of age.matchAll(/([\d.]+)(ms|h|m|s)/g)) {
    seconds += Number(value) * UNIT_SECONDS[unit];
  }
  return seconds;
}

function key(row: RepositoryRow, column: SortColumn): string | number {
  switch (column) {
    case 'repository':
      return row.repository.toLowerCase();
    case 'team':
      return row.team ?? '';
    case 'lifecycle':
      return lifecycleOf(row);
    case 'lastPersonCommit':
      // ISO timestamps order as strings; a repository without one sorts last.
      return row.lastPersonCommit ?? '';
    case 'score':
      return row.orphan.score;
    case 'setup':
      return SETUP_ORDER[setupState(row)];
    case 'findings':
      return row.findings?.length ?? 0;
    case 'age':
      return durationSeconds(row.age);
    default:
      return '';
  }
}

/** The rows sorted by a column; ties keep the manager's order (by score). */
export function sortRows(
  rows: RepositoryRow[],
  column: SortColumn,
  direction: SortDirection,
): RepositoryRow[] {
  const sign = direction === 'asc' ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const ka = key(a.row, column);
      const kb = key(b.row, column);
      if (ka < kb) {
        return -sign;
      }
      if (ka > kb) {
        return sign;
      }
      return a.index - b.index;
    })
    .map(({ row }) => row);
}
