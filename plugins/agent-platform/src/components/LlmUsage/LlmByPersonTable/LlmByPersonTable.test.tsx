import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { LlmPersonRow } from '../../../lib/llmUsage';
import { LlmByPersonTable } from './LlmByPersonTable';

const ROWS: LlmPersonRow[] = [
  {
    id: 'alice@lab.local',
    user: 'alice@lab.local',
    kind: 'person',
    label: 'alice@lab.local',
    tokens: 4_000_000,
    costUsd: 40,
    sharePct: 80,
  },
  {
    id: 'bob@lab.local',
    user: 'bob@lab.local',
    kind: 'person',
    label: 'bob@lab.local',
    tokens: 500_000,
    costUsd: 8,
    sharePct: 16,
  },
  {
    id: 'no-person',
    user: '',
    kind: 'unknown',
    label: 'No person recorded',
    tokens: 2_000_000,
    costUsd: 2,
    sharePct: 4,
  },
];

/** The person column's cell text, top to bottom. */
function renderedOrder(): string[] {
  return screen
    .getAllByRole('rowheader')
    .map(cell => cell.textContent?.trim() ?? '');
}

describe('LlmByPersonTable', () => {
  it('opens sorted by spend, descending, with the unnamed calls as a row of their own', () => {
    render(<LlmByPersonTable rows={ROWS} emptyMessage="none" />);

    expect(renderedOrder()).toEqual([
      'alice@lab.local',
      'bob@lab.local',
      'No person recorded',
    ]);
    expect(screen.getByText('$40.00')).toBeInTheDocument();
    expect(screen.getByText('80%')).toBeInTheDocument();
    // A person has no page in the portal to open.
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  it('re-orders the rendered rows when a column is sorted', async () => {
    render(<LlmByPersonTable rows={ROWS} emptyMessage="none" />);

    await userEvent.click(screen.getByRole('columnheader', { name: /Tokens/ }));

    expect(renderedOrder()).toEqual([
      'bob@lab.local',
      'No person recorded',
      'alice@lab.local',
    ]);
  });

  it('says so when the month holds no person', () => {
    render(
      <LlmByPersonTable
        rows={[]}
        emptyMessage="The gateway named no person on a call in this month."
      />,
    );

    expect(
      screen.getByText('The gateway named no person on a call in this month.'),
    ).toBeInTheDocument();
  });
});
