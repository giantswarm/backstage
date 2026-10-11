import {
  mockDesktopLayout,
  mockPhoneLayout,
  type MockedLayout,
} from '@giantswarm/backstage-plugin-ui-react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { LlmAgentRow } from '../../../lib/llmUsage';
import { LlmByAgentTable } from './LlmByAgentTable';

const ROWS: LlmAgentRow[] = [
  {
    id: 'kagent|big',
    namespace: 'kagent',
    agent: 'big',
    kind: 'agent',
    label: 'Big spender',
    href: '/agents/gazelle/kagent/big',
    tokens: 7_500_000,
    calls: 120,
    costUsd: 42.5,
    sharePct: 85,
  },
  {
    id: 'kagent|chatty',
    namespace: 'kagent',
    agent: 'chatty',
    kind: 'agent',
    label: 'Chatty',
    tokens: 300_000,
    calls: 400,
    costUsd: 6.5,
    sharePct: 13,
  },
  {
    id: 'kagent|idle',
    namespace: 'kagent',
    agent: 'idle',
    kind: 'agent',
    label: 'Almost idle',
    tokens: 60_000,
    calls: 3,
    costUsd: 1,
    sharePct: 2,
  },
];

/** The agent column's cell text, top to bottom. */
function renderedOrder(): string[] {
  return screen
    .getAllByRole('rowheader')
    .map(cell => cell.textContent?.trim() ?? '');
}

describe('LlmByAgentTable', () => {
  it('opens sorted by spend, descending', () => {
    render(<LlmByAgentTable rows={ROWS} emptyMessage="none" />);

    expect(renderedOrder()).toEqual(['Big spender', 'Chatty', 'Almost idle']);
  });

  it('re-orders the rendered rows when a column is sorted', async () => {
    // The regression this exists for: `tableProps` already carries the sorted
    // rows, so passing `data` after spreading it silently reverts every sort
    // while the header's indicator still moves. Asserting the *order* of the
    // rendered rows is the only thing that catches it.
    render(<LlmByAgentTable rows={ROWS} emptyMessage="none" />);

    // A first click on a fresh column sorts ascending, so the busiest agent
    // goes last — the point is that the order *changed* from the opening
    // spend-descending one.
    await userEvent.click(
      screen.getByRole('columnheader', { name: /Model calls/ }),
    );

    expect(renderedOrder()).toEqual(['Almost idle', 'Big spender', 'Chatty']);
  });

  it('sorts by the agent label too', async () => {
    render(<LlmByAgentTable rows={ROWS} emptyMessage="none" />);

    await userEvent.click(screen.getByRole('columnheader', { name: /Agent/ }));

    expect(renderedOrder()).toEqual(['Almost idle', 'Big spender', 'Chatty']);
  });

  it('links only the agents whose CR resolved', () => {
    render(<LlmByAgentTable rows={ROWS} emptyMessage="none" />);

    expect(screen.getByRole('link', { name: 'Big spender' })).toHaveAttribute(
      'href',
      '/agents/gazelle/kagent/big',
    );
    expect(screen.queryByRole('link', { name: 'Chatty' })).toBeNull();
  });

  it('marks a removed agent as removed, unlinked, with its figures', () => {
    render(
      <LlmByAgentTable
        rows={[
          ROWS[0],
          {
            id: 'kagent|gone',
            namespace: 'kagent',
            agent: 'gone',
            kind: 'removed',
            label: 'kagent/gone',
            tokens: 60_000,
            calls: 3,
            costUsd: 1,
            sharePct: 2,
          },
        ]}
        emptyMessage="none"
      />,
    );

    // The technical name is all that is left of a removed agent, so it is
    // shown as `namespace/name` with the mark next to it — a reader must not
    // take it for a system component with spend, nor for an agent to open.
    const removed = screen.getByText('kagent/gone').closest('[role="row"]');
    expect(removed).not.toBeNull();
    expect(within(removed as HTMLElement).getByText('Removed')).toBeVisible();
    expect(within(removed as HTMLElement).queryByRole('link')).toBeNull();
    expect(within(removed as HTMLElement).getByText('$1.00')).toBeVisible();

    const known = screen.getByText('Big spender').closest('[role="row"]');
    expect(within(known as HTMLElement).queryByText('Removed')).toBeNull();
  });

  it('renders unattributed traffic by its label alone, with no mark and no link', () => {
    render(
      <LlmByAgentTable
        rows={[
          {
            id: 'kagent|unknown',
            namespace: 'kagent',
            agent: 'unknown',
            kind: 'unattributed',
            label: 'Unattributed',
            tokens: 1_000,
            calls: 1,
            costUsd: 0.1,
            sharePct: 100,
          },
        ]}
        emptyMessage="none"
      />,
    );

    expect(screen.getByText('Unattributed')).toBeVisible();
    expect(screen.queryByText('Removed')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('renders no share for an agent whose spend could not be priced', () => {
    render(
      <LlmByAgentTable
        rows={[{ ...ROWS[0], costUsd: undefined, sharePct: undefined }]}
        emptyMessage="none"
      />,
    );

    // Two em dashes: the cost and its share. Neither may read as `$0.00` or
    // `0%` — the gateway records nothing for a model it cannot price, so a
    // zero there would assert the agent is free rather than uncounted. This is
    // the one case where a *measured* cost column still has nothing to show.
    expect(screen.getAllByText('—')).toHaveLength(2);
  });

  it('scales each column to its own maximum', () => {
    const { container } = render(
      <LlmByAgentTable rows={ROWS} emptyMessage="none" />,
    );

    const widths = [
      ...container.querySelectorAll<HTMLElement>('[aria-hidden] > div'),
    ].map(fill => fill.style.width);

    // Four bars per row, in column order: calls, tokens, cost, share. The
    // busiest agent by calls is not the biggest spender, so a shared scale
    // across columns would show identical bars where these differ.
    expect(widths.slice(0, 4)).toEqual(['30%', '100%', '100%', '100%']);
  });

  it('gives no bar to an unpriced row, only its track', () => {
    const { container } = render(
      <LlmByAgentTable
        rows={[{ ...ROWS[0], costUsd: undefined, sharePct: undefined }]}
        emptyMessage="none"
      />,
    );

    const widths = [
      ...container.querySelectorAll<HTMLElement>('[aria-hidden] > div'),
    ].map(fill => fill.style.width);

    // calls and tokens are the row's own max; cost and share have no value.
    expect(widths).toEqual(['100%', '100%', '0%', '0%']);
  });

  it('renders the empty message with no rows', () => {
    render(<LlmByAgentTable rows={[]} emptyMessage="Nothing attributed." />);

    expect(screen.getByText('Nothing attributed.')).toBeInTheDocument();
  });

  describe('at fleet scale', () => {
    /** 300 agents, spend falling with the index so the ranking is known. */
    const FLEET: LlmAgentRow[] = Array.from({ length: 300 }, (_, i) => ({
      id: `kagent|agent-${i}`,
      namespace: 'kagent',
      agent: `agent-${i}`,
      kind: 'agent',
      label: `Agent ${String(i).padStart(3, '0')}`,
      tokens: 1_000 * (300 - i),
      calls: 300 - i,
      costUsd: 300 - i,
      sharePct: (300 - i) / 450,
    }));

    it('shows three agents with no reveal control', () => {
      render(<LlmByAgentTable rows={ROWS} emptyMessage="none" />);

      expect(screen.getAllByRole('rowheader')).toHaveLength(3);
      expect(screen.queryByRole('button', { name: /^Show/ })).toBeNull();
      expect(screen.queryByText(/shown/)).toBeNull();
      expect(screen.queryByRole('searchbox')).toBeNull();
    });

    it('renders the top 20 spenders of 300 and offers the rest', async () => {
      // Shuffled input: the slice must come after the sort, so the first page
      // is the biggest spenders whatever order the query returned them in.
      const shuffled = [...FLEET].reverse();
      render(<LlmByAgentTable rows={shuffled} emptyMessage="none" />);

      const order = renderedOrder();
      expect(order).toHaveLength(20);
      expect(order[0]).toBe('Agent 000');
      expect(order[19]).toBe('Agent 019');
      expect(screen.getByText('20 agents shown, 280 more')).toBeVisible();

      await userEvent.click(
        screen.getByRole('button', { name: 'Show 20 more agents' }),
      );
      expect(renderedOrder()).toHaveLength(40);
    });

    it('slices after a column sort, not before it', async () => {
      render(<LlmByAgentTable rows={FLEET} emptyMessage="none" />);

      // Ascending by calls: the quietest agents of all 300 come first, not
      // the quietest of the first page.
      await userEvent.click(
        screen.getByRole('columnheader', { name: /Model calls/ }),
      );

      const order = renderedOrder();
      expect(order).toHaveLength(20);
      expect(order[0]).toBe('Agent 299');
    });
  });
});

// T22 B10: five columns in 343px clipped every figure.
describe('LlmByAgentTable at phone width', () => {
  let layout: MockedLayout;
  afterEach(() => layout.restore());

  const headers = () =>
    screen.getAllByRole('columnheader').map(cell => cell.textContent?.trim());

  it('keeps the agent and its cost', () => {
    layout = mockPhoneLayout();
    render(<LlmByAgentTable rows={ROWS} emptyMessage="none" />);

    expect(headers()).toEqual(['Agent', 'Spend']);
    expect(screen.getByRole('link', { name: 'Big spender' })).toBeVisible();
    expect(screen.getByText('$42.50')).toBeVisible();
    expect(screen.queryByText('Model calls')).toBeNull();
  });

  it('keeps every column on a desktop', () => {
    layout = mockDesktopLayout();
    render(<LlmByAgentTable rows={ROWS} emptyMessage="none" />);

    expect(headers()).toEqual([
      'Agent',
      'Model calls',
      'Tokens',
      'Spend',
      'Share of spend',
    ]);
  });

  it('opens what Removed means on a press, not only on hover (C23)', async () => {
    layout = mockPhoneLayout();
    const user = userEvent.setup();
    render(
      <LlmByAgentTable
        rows={[
          {
            id: 'kagent|gone',
            namespace: 'kagent',
            agent: 'gone',
            kind: 'removed',
            label: 'kagent/gone',
            tokens: 1,
            calls: 1,
            costUsd: 1,
            sharePct: 100,
          },
        ]}
        emptyMessage="none"
      />,
    );

    await user.click(
      screen.getByRole('button', { name: 'What Removed means' }),
    );
    expect(
      await screen.findByText(/This agent is unknown to this portal/),
    ).toBeVisible();
  });
});
