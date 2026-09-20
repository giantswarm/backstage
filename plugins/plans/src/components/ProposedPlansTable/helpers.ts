import { EpicRef, PlanPull } from '../../apis';

/**
 * One row of the proposed-plans table: an open pull request, plus the roadmap
 * epic it references when it has one.
 *
 * `id` repeats `number` because bui's table keys rows by `id`; sorting reads
 * `number`, so both have to be present.
 */
export type PlanPullRow = PlanPull & {
  id: number;
  epic?: EpicRef;
};

/** Parsed epoch milliseconds, or undefined when the value is missing or unparsable. */
function timestampValue(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const time = new Date(value).getTime();
  return isNaN(time) ? undefined : time;
}

/**
 * Sort rows for the table, by column id and direction.
 *
 * `updatedAt` compares parsed times so string ordering can't mislead, and rows
 * with an unknown timestamp sort last in *both* directions — "unknown" is not
 * "oldest". The pull number breaks every tie, so the order is total: rows never
 * shuffle between renders of the same data.
 */
export function sortPullsBy(
  rows: PlanPullRow[],
  sort: { column: unknown; direction: 'ascending' | 'descending' },
): PlanPullRow[] {
  const column = String(sort.column);
  const factor = sort.direction === 'ascending' ? 1 : -1;

  const compare = (a: PlanPullRow, b: PlanPullRow): number => {
    switch (column) {
      case 'number':
        return (a.number - b.number) * factor;

      case 'updatedAt': {
        const aTime = timestampValue(a.updatedAt);
        const bTime = timestampValue(b.updatedAt);
        if (aTime === bTime) {
          return 0;
        }
        if (aTime === undefined) return 1;
        if (bTime === undefined) return -1;
        return (aTime - bTime) * factor;
      }

      case 'draft':
        // Booleans, not the rendered label: the cell is empty for a ready PR,
        // and an empty string would sort against "Draft" by accident.
        return (Number(a.draft) - Number(b.draft)) * factor;

      default: {
        const aValue = String(a[column as keyof PlanPullRow] ?? '');
        const bValue = String(b[column as keyof PlanPullRow] ?? '');
        return aValue.localeCompare(bValue) * factor;
      }
    }
  };

  return [...rows].sort((a, b) => compare(a, b) || b.number - a.number);
}
