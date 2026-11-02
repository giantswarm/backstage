import { act, render, renderHook, screen } from '@testing-library/react';
import { CellText, ColumnConfig, Table } from '@backstage/ui';
import {
  mockDesktopLayout,
  MockedLayout,
  mockPhoneLayout,
} from '../../testUtils/mockPhoneLayout';
import { usePhoneColumns } from './usePhoneColumns';

type CostRow = {
  id: string;
  model: string;
  provider: string;
  calls: number;
  tokens: number;
  cost: string;
};

const columns: ColumnConfig<CostRow>[] = [
  {
    id: 'model',
    label: 'Model',
    isRowHeader: true,
    cell: row => <CellText title={row.model} />,
  },
  {
    id: 'provider',
    label: 'Provider',
    cell: row => <CellText title={row.provider} />,
  },
  {
    id: 'calls',
    label: 'Calls',
    cell: row => <CellText title={String(row.calls)} />,
  },
  {
    id: 'tokens',
    label: 'Avg tokens/call',
    cell: row => <CellText title={String(row.tokens)} />,
  },
  { id: 'cost', label: 'Cost', cell: row => <CellText title={row.cost} /> },
];

const threeRows: CostRow[] = [
  {
    id: '1',
    model: 'gpt-4o',
    provider: 'OpenAI',
    calls: 120,
    tokens: 812,
    cost: '$4.10',
  },
  {
    id: '2',
    model: 'claude-sonnet',
    provider: 'Anthropic',
    calls: 48,
    tokens: 1530,
    cost: '$2.92',
  },
  {
    id: '3',
    model: 'llama3.1:8b',
    provider: 'Self-hosted',
    calls: 9,
    tokens: 410,
    cost: '$0.00',
  },
];

// A realistic month: dozens of models, long provider-qualified ids.
const manyRows: CostRow[] = Array.from({ length: 40 }, (_, index) => ({
  id: `m${index}`,
  model: `us.anthropic.claude-3-5-sonnet-20241022-v2:0-variant-${index}`,
  provider: index % 3 === 0 ? 'Bedrock' : 'Azure OpenAI',
  calls: 1000 - index * 7,
  tokens: 300 + index * 11,
  cost: `$${(100 - index * 1.5).toFixed(2)}`,
}));

function CostTable({ rows }: { rows: CostRow[] }) {
  const columnConfig = usePhoneColumns(columns, ['tokens', 'cost']);
  return (
    <Table
      columnConfig={columnConfig}
      data={rows}
      pagination={{ type: 'none' }}
    />
  );
}

const headers = () =>
  screen.getAllByRole('columnheader').map(header => header.textContent);

describe('usePhoneColumns', () => {
  let layout: MockedLayout | undefined;
  afterEach(() => {
    layout?.restore();
    layout = undefined;
  });

  it.each([
    ['three rows', threeRows],
    ['forty rows', manyRows],
  ])(
    'keeps the name and the decisive numbers at phone width (%s)',
    (_, rows) => {
      layout = mockPhoneLayout();
      render(<CostTable rows={rows} />);

      expect(headers()).toEqual(['Model', 'Avg tokens/call', 'Cost']);
      expect(screen.getAllByRole('row')).toHaveLength(rows.length + 1);
      expect(screen.queryByText(rows[0].provider)).not.toBeInTheDocument();
      expect(screen.getByText(rows[0].cost)).toBeInTheDocument();
    },
  );

  it.each([
    ['three rows', threeRows],
    ['forty rows', manyRows],
  ])('shows every column on a desktop (%s)', (_, rows) => {
    layout = mockDesktopLayout();
    render(<CostTable rows={rows} />);

    expect(headers()).toEqual([
      'Model',
      'Provider',
      'Calls',
      'Avg tokens/call',
      'Cost',
    ]);
  });

  it('brings the columns back when the viewport widens', () => {
    layout = mockPhoneLayout();
    render(<CostTable rows={threeRows} />);
    expect(headers()).toHaveLength(3);

    act(() => layout!.setWidth(1024));
    expect(headers()).toHaveLength(5);
  });

  it('keeps the row header even when not named, and what the caller hid stays hidden', () => {
    layout = mockPhoneLayout();
    const withHidden = columns.map(column =>
      column.id === 'cost' ? { ...column, isHidden: true } : column,
    );
    const { result } = renderHook(() =>
      usePhoneColumns(withHidden, ['calls', 'cost']),
    );

    expect(
      result.current.filter(column => !column.isHidden).map(c => c.id),
    ).toEqual(['model', 'calls']);
  });

  it('returns the same columns across renders with a literal keep list', () => {
    layout = mockPhoneLayout();
    const { result, rerender } = renderHook(() =>
      usePhoneColumns(columns, ['cost']),
    );
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it('warns about a kept id that names no column', () => {
    layout = mockPhoneLayout();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    renderHook(() => usePhoneColumns(columns, ['cost', 'costs']));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"costs"'));
    warn.mockRestore();
  });
});
