import { render, screen } from '@testing-library/react';
import { TopCallsTable } from './TopCallsTable';
import type { TopCallsRow } from './TopCallsTable';

const THREE: TopCallsRow[] = [
  { id: 'get', name: 'x_kubernetes_get', calls: 84 },
  { id: 'list', name: 'x_kubernetes_list', calls: 12 },
  { id: 'query', name: 'x_prometheus_execute_query', calls: 3 },
];

/**
 * What the route sends for 300 distinct tools: the top ten, and the other 290
 * as a count with their calls — one call each here, so 290 calls.
 */
const TOP_OF_300: TopCallsRow[] = Array.from({ length: 10 }, (_, i) => ({
  id: `tool-${i}`,
  name: `x_srv_tool${i}`,
  calls: 100 - i,
}));

function renderTable(props: Partial<Parameters<typeof TopCallsTable>[0]>) {
  return render(
    <TopCallsTable
      title="Top tools"
      nameLabel="Tool"
      rows={THREE}
      emptyMessage="No tool calls in this window."
      {...props}
    />,
  );
}

describe('TopCallsTable', () => {
  it('shows three tools with no remainder line, reveal control or pagination', () => {
    renderTable({ other: { count: 0, calls: 0 } });

    expect(screen.getAllByRole('rowheader')).toHaveLength(3);
    expect(screen.queryByText(/^and \d+ more/)).toBeNull();
    expect(screen.queryByRole('button', { name: /^Show/ })).toBeNull();
    // bui's pagination footer carries a page-size select.
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('renders nothing extra when the response carries no remainder', () => {
    // A backend that predates the field.
    renderTable({});

    expect(screen.queryByText(/^and \d+ more/)).toBeNull();
  });

  it('says what the cap left out of 300 tools', () => {
    renderTable({ rows: TOP_OF_300, other: { count: 290, calls: 1_290 } });

    expect(screen.getAllByRole('rowheader')).toHaveLength(10);
    expect(
      screen.getByText('and 290 more, 1,290 calls between them.'),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: /^Show/ })).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('words a single left-out entry as one', () => {
    renderTable({
      rows: TOP_OF_300,
      other: { count: 1, calls: 1 },
    });

    expect(screen.getByText('and 1 more, 1 call.')).toBeVisible();
  });

  it('renders the empty message with no rows', () => {
    renderTable({ rows: [], other: { count: 0, calls: 0 } });

    expect(
      screen.getByText('No tool calls in this window.'),
    ).toBeInTheDocument();
  });
});
