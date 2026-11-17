import { act, render, screen } from '@testing-library/react';
import { Cell, Table, type ColumnConfig } from '@backstage/ui';
import {
  mockContainerWidth,
  mockDesktopLayout,
  type MockedContainerWidth,
  type MockedLayout,
} from '../../testUtils';
import { useFittingColumns } from './useFittingColumns';

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

function Probe() {
  const fit = useFittingColumns(COLUMNS, {
    minWidths: MIN_WIDTHS,
    dropFirst: ['zone'],
    narrowColumns: NARROW,
  });
  return (
    <div ref={fit.ref}>
      {fit.isCompact ? (
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

    act(() => container.setWidth(400));
    expect(headers()).toEqual(['Name', 'Cost']);
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
});
