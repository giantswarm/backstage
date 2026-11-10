import type { SortDescriptor } from '@backstage/ui';

/** What the Connectors table's sort reads of a row. */
export type SortableConnectorRow = {
  entry: {
    /** The name the row shows: the display name, else the name. */
    displayName: string;
    /** The connector's name. */
    id: string;
    toolCount?: number;
  };
  auth: string;
  status: { label: string };
};

/** The columns a header click sorts the Connectors table by. */
export type ConnectorSortColumn = 'name' | 'auth' | 'tools' | 'status';

/** The Connectors table's order before any header is clicked. */
export const CONNECTORS_DEFAULT_SORT: SortDescriptor = {
  column: 'name',
  direction: 'ascending',
};

const collator = new Intl.Collator(undefined, {
  sensitivity: 'base',
  numeric: true,
});

/**
 * Compares text the way a person reads a list: case-insensitive, so
 * "Muster" sorts with "muster", and digits by their value.
 */
function compareText(a: string, b: string): number {
  return collator.compare(a, b);
}

/** By the name a row shows, then by its name, so equal names keep an order. */
function compareNames(
  a: SortableConnectorRow,
  b: SortableConnectorRow,
): number {
  return (
    compareText(a.entry.displayName, b.entry.displayName) ||
    compareText(a.entry.id, b.entry.id) ||
    // Only case tells these apart: still a fixed order.
    a.entry.id.localeCompare(b.entry.id)
  );
}

/**
 * Compares a value a row may lack: rows without one go last whichever way
 * the column sorts, so a reversed sort does not lead with blanks.
 */
function compareOptional<T>(
  a: T | undefined,
  b: T | undefined,
  compare: (x: T, y: T) => number,
  factor: number,
): number {
  if (a === undefined || b === undefined) {
    if (a === b) {
      return 0;
    }
    return a === undefined ? 1 : -1;
  }
  return compare(a, b) * factor;
}

const orEmpty = (text: string) => (text === '' ? undefined : text);

/**
 * The Connectors table's rows in the order of its sort: by name (the default),
 * by how one signs in, by tool count or by state. Every column falls back to
 * the name, ascending whichever way the column sorts, so reversing a sort does
 * not shuffle the rows it holds equal.
 */
export function sortConnectorRows<Row extends SortableConnectorRow>(
  rows: Row[],
  sort: SortDescriptor,
): Row[] {
  const factor = sort.direction === 'descending' ? -1 : 1;
  const column = String(sort.column) as ConnectorSortColumn;
  const primary = (a: Row, b: Row): number => {
    switch (column) {
      case 'auth':
        return compareOptional(
          orEmpty(a.auth),
          orEmpty(b.auth),
          compareText,
          factor,
        );
      case 'tools':
        return compareOptional(
          a.entry.toolCount,
          b.entry.toolCount,
          (x, y) => x - y,
          factor,
        );
      case 'status':
        return compareOptional(
          orEmpty(a.status.label),
          orEmpty(b.status.label),
          compareText,
          factor,
        );
      case 'name':
        return compareNames(a, b) * factor;
      default:
        return 0;
    }
  };
  return [...rows].sort((a, b) => primary(a, b) || compareNames(a, b));
}
