import { act, render, screen } from '@testing-library/react';
import { Cell, Table, type ColumnConfig } from '@backstage/ui';
import {
  mockContainerWidth,
  mockDesktopLayout,
  type MockedContainerWidth,
  type MockedLayout,
} from '../../testUtils';
import { type FittingTier, useFittingColumns } from './useFittingColumns';

type Row = { id: string; name: string; zone: string; cost: string };

const column = (id: keyof Row, label: string): ColumnConfig<Row> => ({
  id,
  label,
  isRowHeader: id === 'name',
  cell: row => <Cell>{row[id]}</Cell>,
});

const COLUMNS = [
  column('name', 'Name'),
  column('zone', 'Zone'),
  column('cost', 'Cost'),
];
const NARROW = [
  {
    ...COLUMNS[0],
    cell: (row: Row) => <Cell>{`${row.name} in ${row.zone}`}</Cell>,
  },
  COLUMNS[1],
  COLUMNS[2],
];
// Name 160 (the default), Zone 150, Cost 120: 430 for all, 280 without Zone.
const MIN_WIDTHS = { zone: 150, cost: 120 };
const DROP_FIRST = ['zone'];
const COMPACT = [
  {
    ...COLUMNS[0],
    cell: (row: Row) => <Cell>{`${row.name}, compact`}</Cell>,
  },
  COLUMNS[1],
  COLUMNS[2],
];
const COLUMNS_OF: Record<FittingTier, ColumnConfig<Row>[]> = {
  full: COLUMNS,
  narrow: NARROW,
  compact: COMPACT,
};
const columnsFor = (tier: FittingTier) => COLUMNS_OF[tier];
const COMPACT_MIN_WIDTHS = { name: 90 };

function Probe({ keepTable = false }: { keepTable?: boolean }) {
  const fit = useFittingColumns(columnsFor, {
    minWidths: MIN_WIDTHS,
    dropFirst: DROP_FIRST,
    compactMinWidths: COMPACT_MIN_WIDTHS,
  });
  return (
    <div ref={fit.ref}>
      <p>hidden: {fit.hiddenIds.join(',')}</p>
      {fit.isCompact && !keepTable ? (
        <p>compact</p>
      ) : (
        <Table
          columnConfig={fit.columns}
          data={[{ id: '1', name: 'a', zone: 'z1', cost: '$1' }]}
          pagination={{ type: 'none' }}
        />
      )}
    </div>
  );
}

describe('useFittingColumns', () => {
  let layout: MockedLayout;
  let container: MockedContainerWidth;
  afterEach(() => {
    container.restore();
    layout.restore();
  });

  const headers = () =>
    screen.getAllByRole('columnheader').map(cell => cell.textContent);

  it('shows every column while their minimums fit, then drops, then goes compact', () => {
    layout = mockDesktopLayout();
    container = mockContainerWidth(500);
    render(<Probe />);
    expect(headers()).toEqual(['Name', 'Zone', 'Cost']);

    expect(screen.getByText('hidden:')).toBeInTheDocument();

    act(() => container.setWidth(400));
    expect(headers()).toEqual(['Name', 'Cost']);
    expect(screen.getByText('hidden: zone')).toBeInTheDocument();
    expect(screen.getByText('a in z1')).toBeInTheDocument();

    act(() => container.setWidth(250));
    expect(screen.getByText('compact')).toBeInTheDocument();
  });

  it('gives each column its minimum width', () => {
    layout = mockDesktopLayout();
    container = mockContainerWidth(500);
    render(<Probe />);

    expect(screen.getByRole('columnheader', { name: 'Zone' })).toHaveStyle({
      width: '150px',
    });
  });

  it('hands a caller that keeps a table the compact columns, with their own minimums', () => {
    layout = mockDesktopLayout();
    container = mockContainerWidth(250);
    render(<Probe keepTable />);

    expect(screen.getByText('a, compact')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Name' })).toHaveStyle({
      width: '90px',
    });
  });
});
