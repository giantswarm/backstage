import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ByModelTable } from './ByModelTable';
import type { ByModelRow } from './helpers';

const ROWS: ByModelRow[] = [
  {
    id: 'claude',
    model: 'Claude Sonnet',
    agents: 1,
    sessions: 2,
    turns: 9,
    inputTokens: 7_500_000,
    outputTokens: 28_800,
  },
  {
    id: 'gpt',
    model: 'GPT-4o',
    agents: 3,
    sessions: 8,
    turns: 20,
    inputTokens: 300_000,
    outputTokens: 3_600,
  },
  {
    id: 'unknown-model',
    model: 'Unknown model',
    agents: 2,
    sessions: 1,
    turns: 1,
    inputTokens: 60_000,
    outputTokens: 4_000,
  },
];

function renderedOrder(): string[] {
  return screen
    .getAllByRole('rowheader')
    .map(cell => cell.textContent?.trim() ?? '');
}

describe('ByModelTable', () => {
  it('opens sorted by input tokens, descending', () => {
    render(<ByModelTable rows={ROWS} emptyMessage="none" />);

    expect(renderedOrder()).toEqual([
      'Claude Sonnet',
      'GPT-4o',
      'Unknown model',
    ]);
  });

  it('re-orders the rendered rows when a column is sorted', async () => {
    // Same regression guard as the By agent table: assert the order of
    // rendered cells, not that the header exists.
    render(<ByModelTable rows={ROWS} emptyMessage="none" />);

    await userEvent.click(screen.getByRole('columnheader', { name: /Agents/ }));

    expect(renderedOrder()).toEqual([
      'Claude Sonnet',
      'Unknown model',
      'GPT-4o',
    ]);
  });

  it('sorts by model name', async () => {
    render(<ByModelTable rows={ROWS} emptyMessage="none" />);

    await userEvent.click(screen.getByRole('columnheader', { name: /Model/ }));

    expect(renderedOrder()).toEqual([
      'Claude Sonnet',
      'GPT-4o',
      'Unknown model',
    ]);
  });

  it('says the model is the agent’s current one', () => {
    // Not a historical breakdown: kagent records no per-session model, so this
    // caveat is the difference between a true table and a misleading one.
    render(<ByModelTable rows={ROWS} emptyMessage="none" />);

    expect(
      screen.getByText(/records no model per session/i),
    ).toBeInTheDocument();
  });

  it('renders the empty message with no rows', () => {
    render(<ByModelTable rows={[]} emptyMessage="No model resolved." />);

    expect(screen.getByText('No model resolved.')).toBeInTheDocument();
  });
});
