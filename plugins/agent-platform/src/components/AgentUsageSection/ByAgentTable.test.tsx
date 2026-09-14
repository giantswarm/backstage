import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ByAgentTable } from './ByAgentTable';
import type { ByAgentRow } from './helpers';

const ROWS: ByAgentRow[] = [
  {
    id: 'a',
    agentName: 'Big spender',
    sessions: 5,
    turns: 19,
    inputTokens: 7_500_000,
    outputTokens: 28_800,
  },
  {
    id: 'b',
    agentName: 'Chatty',
    sessions: 9,
    turns: 40,
    inputTokens: 300_000,
    outputTokens: 3_600,
  },
  {
    id: 'c',
    agentName: 'Almost idle',
    sessions: 1,
    turns: 1,
    inputTokens: 60_000,
    outputTokens: 4_000,
  },
];

/** The agent column's cell text, top to bottom. */
function renderedOrder(): string[] {
  return screen
    .getAllByRole('rowheader')
    .map(cell => cell.textContent?.trim() ?? '');
}

describe('ByAgentTable', () => {
  it('opens sorted by input tokens, descending', () => {
    render(<ByAgentTable rows={ROWS} emptyMessage="none" />);

    expect(renderedOrder()).toEqual(['Big spender', 'Chatty', 'Almost idle']);
  });

  it('re-orders the rendered rows when a column is sorted', async () => {
    // The regression this exists for: `tableProps` already carries the sorted
    // rows, so passing `data` after spreading it silently reverted every sort
    // while the header's indicator still moved. Asserting the *order* of
    // rendered cells is what catches that; asserting the header exists does not.
    render(<ByAgentTable rows={ROWS} emptyMessage="none" />);

    await userEvent.click(
      screen.getByRole('columnheader', { name: /Sessions/ }),
    );

    expect(renderedOrder()).toEqual(['Almost idle', 'Big spender', 'Chatty']);
  });

  it('sorts by the agent name too', async () => {
    render(<ByAgentTable rows={ROWS} emptyMessage="none" />);

    await userEvent.click(screen.getByRole('columnheader', { name: /Agent/ }));

    expect(renderedOrder()).toEqual(['Almost idle', 'Big spender', 'Chatty']);
  });

  it('holds a skeleton, not an em dash, while the rate is in flight', () => {
    // The counts come from kagent and land well before the two Mimir rate
    // queries, so an em dash here read as "nothing could be priced" — a
    // finding — when the truth was only "not yet". This page works hard to
    // keep those two apart everywhere else.
    const { container } = render(
      <ByAgentTable rows={ROWS} emptyMessage="none" isRateLoading />,
    );

    expect(screen.queryByText('—')).toBeNull();
    expect(container.querySelectorAll('.bui-Skeleton').length).toBe(
      ROWS.length,
    );
  });

  it('shows the figure once the rate lands', () => {
    const { container } = render(
      <ByAgentTable
        rows={ROWS}
        emptyMessage="none"
        rates={{ blended: 3 / 1_000_000 }}
      />,
    );

    expect(container.querySelectorAll('.bui-Skeleton').length).toBe(0);
    // 7.5M input + 28.8k output at $3/1M.
    expect(screen.getByText('$22.59')).toBeInTheDocument();
  });

  it('renders the empty message with no rows', () => {
    render(<ByAgentTable rows={[]} emptyMessage="kagent recorded no agent." />);

    expect(screen.getByText('kagent recorded no agent.')).toBeInTheDocument();
  });
});
