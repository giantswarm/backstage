import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { LlmModelRow } from '../../../lib/llmUsage';
import { LlmByModelTable } from './LlmByModelTable';

const ROWS: LlmModelRow[] = [
  {
    id: 'sonnet',
    model: 'claude-sonnet-5',
    tokens: 6_000_000,
    calls: 60,
    costUsd: 30,
    usdPerMillion: 5,
    avgTokensPerCall: 100_000,
    sharePct: 75,
  },
  {
    id: 'haiku',
    model: 'claude-haiku-4-5',
    tokens: 4_000_000,
    calls: 400,
    costUsd: 10,
    usdPerMillion: 2.5,
    avgTokensPerCall: 10_000,
    sharePct: 25,
  },
];

function renderedOrder(): string[] {
  return screen
    .getAllByRole('rowheader')
    .map(cell => cell.textContent?.trim() ?? '');
}

describe('LlmByModelTable', () => {
  it('opens sorted by spend, descending', () => {
    render(<LlmByModelTable rows={ROWS} emptyMessage="none" />);

    expect(renderedOrder()).toEqual(['claude-sonnet-5', 'claude-haiku-4-5']);
  });

  it('re-orders the rendered rows when a column is sorted', async () => {
    render(<LlmByModelTable rows={ROWS} emptyMessage="none" />);

    // Tokens, not Model calls: a first click sorts ascending, and ascending
    // by calls happens to match the opening spend-descending order — so that
    // column would pass this test even with the sort broken. Tokens flips it.
    await userEvent.click(screen.getByRole('columnheader', { name: /Tokens/ }));

    expect(renderedOrder()).toEqual(['claude-haiku-4-5', 'claude-sonnet-5']);
  });

  it('shows an em dash for a ratio that could not be derived', () => {
    render(
      <LlmByModelTable
        rows={[
          {
            ...ROWS[0],
            costUsd: undefined,
            usdPerMillion: undefined,
            avgTokensPerCall: undefined,
          },
        ]}
        emptyMessage="none"
      />,
    );

    // Cost, $/1M and average tokens per call.
    expect(screen.getAllByText('—')).toHaveLength(3);
  });

  it('renders the empty message with no rows', () => {
    render(<LlmByModelTable rows={[]} emptyMessage="No model answered." />);

    expect(screen.getByText('No model answered.')).toBeInTheDocument();
  });
});
