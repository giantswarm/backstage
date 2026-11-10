import type { SortDescriptor } from '@backstage/ui';
import type { ConnectorReach } from './connectorRows';

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
  /** The row's state as it reads, and its tone. */
  status: { label: string; tone: string };
  /** Whether the connector answers now: the Connection filter's bucket. */
  reach?: ConnectorReach;
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
 * The urgency of a row's state, most urgent first, in the order the Status
 * column's first click sorts by:
 *
 * 1. Sign in needed: this person can fix it now, from the row.
 * 2. Sign-in expired: the same, once more.
 * 3. Not connected, failing: "Failed", "Cannot connect", muster unreachable.
 * 4. Not connected, a warning: "Stopped", "Disconnected", "Starting", muster
 *    waiting for a session.
 * 5. Not connected otherwise: "Connecting", an unknown state.
 * 6. Partly connected: some of a family's instances answer.
 * 7. Portal only: answers here, but not for agents.
 * 8. Connected.
 * 9. Deactivated: switched off on purpose.
 *
 * A row without a state has no urgency: it goes last whichever way the
 * column sorts.
 */
export function statusUrgency(row: SortableConnectorRow): number | undefined {
  switch (row.reach) {
    case 'sign-in':
      return row.status.label === 'Sign in needed' ? 1 : 2;
    case 'not-connected':
      if (row.status.tone === 'danger') {
        return 3;
      }
      return row.status.tone === 'warning' ? 4 : 5;
    case 'partial':
      return 6;
    case 'portal-only':
      return 7;
    case 'connected':
      return 8;
    case 'deactivated':
      return 9;
    default:
      return undefined;
  }
}

/**
 * The Connectors table's rows in the order of its sort: by name (the default),
 * by how one signs in, by tool count or by the urgency of the state
 * ({@link statusUrgency}). Every column falls back to the name, ascending
 * whichever way the column sorts, so reversing a sort does not shuffle the
 * rows it holds equal.
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
          statusUrgency(a),
          statusUrgency(b),
          (x, y) => x - y,
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
