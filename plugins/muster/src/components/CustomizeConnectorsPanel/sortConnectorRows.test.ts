import type { ConnectorReach } from './connectorRows';
import {
  CONNECTORS_DEFAULT_SORT,
  type SortableConnectorRow,
  sortConnectorRows,
} from './sortConnectorRows';

function row(
  id: string,
  options: {
    displayName?: string;
    auth?: string;
    toolCount?: number;
    status?: string;
    tone?: string;
    reach?: ConnectorReach;
  } = {},
): SortableConnectorRow {
  return {
    entry: {
      id,
      displayName: options.displayName ?? id,
      toolCount: options.toolCount,
    },
    auth: options.auth ?? '',
    status: { label: options.status ?? '', tone: options.tone ?? 'neutral' },
    ...(options.reach ? { reach: options.reach } : {}),
  };
}

const ids = (rows: SortableConnectorRow[]) => rows.map(r => r.entry.id);

describe('sortConnectorRows', () => {
  it('sorts by the name a row shows, its name where it has no display name', () => {
    const rows = [
      row('z-crm', { displayName: 'Charlie' }),
      row('alpha'),
      row('y-search', { displayName: 'beta' }),
    ];

    expect(ids(sortConnectorRows(rows, CONNECTORS_DEFAULT_SORT))).toEqual([
      'alpha',
      'y-search',
      'z-crm',
    ]);
  });

  it('ignores case, and breaks a tie by the name', () => {
    const rows = [
      row('muster'),
      row('acme', { displayName: 'Muster' }),
      row('Zebra'),
      row('apple'),
    ];

    expect(ids(sortConnectorRows(rows, CONNECTORS_DEFAULT_SORT))).toEqual([
      'apple',
      'acme',
      'muster',
      'Zebra',
    ]);
  });

  it('reverses the order by name', () => {
    const rows = [row('b'), row('a'), row('c')];

    expect(
      ids(sortConnectorRows(rows, { column: 'name', direction: 'descending' })),
    ).toEqual(['c', 'b', 'a']);
  });

  it('sorts by sign-in, the name breaking ties ascending either way', () => {
    const rows = [
      row('d', { auth: 'Your own account' }),
      row('c', { auth: 'No sign-in' }),
      row('b', { auth: 'Your own account' }),
      row('a', { auth: 'Company login' }),
    ];

    expect(
      ids(sortConnectorRows(rows, { column: 'auth', direction: 'ascending' })),
    ).toEqual(['a', 'c', 'b', 'd']);
    expect(
      ids(sortConnectorRows(rows, { column: 'auth', direction: 'descending' })),
    ).toEqual(['b', 'd', 'c', 'a']);
  });

  it('sorts by tool count, rows without one last either way', () => {
    const rows = [
      row('a'),
      row('b', { toolCount: 12 }),
      row('c', { toolCount: 2 }),
      row('d', { toolCount: 0 }),
    ];

    expect(
      ids(sortConnectorRows(rows, { column: 'tools', direction: 'ascending' })),
    ).toEqual(['d', 'c', 'b', 'a']);
    expect(
      ids(
        sortConnectorRows(rows, { column: 'tools', direction: 'descending' }),
      ),
    ).toEqual(['b', 'c', 'd', 'a']);
  });

  it('sorts by state, most urgent first, rows without one last either way', () => {
    const rows = [
      row('a'),
      row('b', { status: 'Connected', tone: 'success', reach: 'connected' }),
      row('c', { status: 'Deactivated', reach: 'deactivated' }),
      row('d', { status: 'Connecting', reach: 'not-connected' }),
      row('e', {
        status: 'Sign-in expired',
        tone: 'warning',
        reach: 'sign-in',
      }),
      row('f', { status: 'Failed', tone: 'danger', reach: 'not-connected' }),
      row('g', {
        status: 'Portal only',
        tone: 'warning',
        reach: 'portal-only',
      }),
      row('h', {
        status: 'Sign in needed',
        tone: 'warning',
        reach: 'sign-in',
      }),
      row('i', {
        status: '1 of 2 connected',
        tone: 'danger',
        reach: 'partial',
      }),
      row('j', {
        status: 'Stopped',
        tone: 'warning',
        reach: 'not-connected',
      }),
      row('k', {
        status: 'Sign in needed',
        tone: 'warning',
        reach: 'sign-in',
      }),
    ];

    expect(
      ids(
        sortConnectorRows(rows, { column: 'status', direction: 'ascending' }),
      ),
    ).toEqual(['h', 'k', 'e', 'f', 'j', 'd', 'i', 'g', 'b', 'c', 'a']);
    // Reversed, the name still breaks the tie between h and k.
    expect(
      ids(
        sortConnectorRows(rows, { column: 'status', direction: 'descending' }),
      ),
    ).toEqual(['c', 'b', 'g', 'i', 'd', 'j', 'f', 'e', 'h', 'k', 'a']);
  });

  it('leaves the rows it is given as they are', () => {
    const rows = [row('b'), row('a')];
    sortConnectorRows(rows, CONNECTORS_DEFAULT_SORT);

    expect(ids(rows)).toEqual(['b', 'a']);
  });
});
