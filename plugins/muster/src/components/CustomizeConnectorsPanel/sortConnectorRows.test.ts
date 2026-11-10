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
  } = {},
): SortableConnectorRow {
  return {
    entry: {
      id,
      displayName: options.displayName ?? id,
      toolCount: options.toolCount,
    },
    auth: options.auth ?? '',
    status: { label: options.status ?? '' },
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

  it('sorts by state, rows without one last either way', () => {
    const rows = [
      row('a'),
      row('b', { status: 'Sign in needed' }),
      row('c', { status: 'Connected' }),
      row('d', { status: 'Deactivated' }),
    ];

    expect(
      ids(
        sortConnectorRows(rows, { column: 'status', direction: 'ascending' }),
      ),
    ).toEqual(['c', 'd', 'b', 'a']);
    expect(
      ids(
        sortConnectorRows(rows, { column: 'status', direction: 'descending' }),
      ),
    ).toEqual(['b', 'd', 'c', 'a']);
  });

  it('leaves the rows it is given as they are', () => {
    const rows = [row('b'), row('a')];
    sortConnectorRows(rows, CONNECTORS_DEFAULT_SORT);

    expect(ids(rows)).toEqual(['b', 'a']);
  });
});
