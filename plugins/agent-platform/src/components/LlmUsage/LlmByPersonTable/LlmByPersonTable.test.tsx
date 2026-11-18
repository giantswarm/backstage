import {
  mockContainerWidth,
  mockDesktopLayout,
} from '@giantswarm/backstage-plugin-ui-react/testUtils';
import { act, render, screen } from '@testing-library/react';
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

describe('LlmByPersonTable in a card too narrow for every column', () => {
  const headers = () =>
    screen.getAllByRole('columnheader').map(cell => cell.textContent?.trim());

  it('keeps the person and their spend, and every column once it is wide enough', () => {
    const layout = mockDesktopLayout();
    const container = mockContainerWidth(424);
    try {
      const { unmount } = render(
        <LlmByPersonTable rows={ROWS} emptyMessage="none" />,
      );
      expect(headers()).toEqual(['Person', 'Spend']);
      unmount();

      container.setWidth(936);
      render(<LlmByPersonTable rows={ROWS} emptyMessage="none" />);
      expect(headers()).toEqual([
        'Person',
        'Tokens',
        'Spend',
        'Share of spend',
      ]);
    } finally {
      container.restore();
      layout.restore();
    }
  });

  it('sorts by spend again when the sorted column is hidden', async () => {
    const layout = mockDesktopLayout();
    const container = mockContainerWidth(936);
    try {
      render(<LlmByPersonTable rows={ROWS} emptyMessage="none" />);
      await userEvent.click(
        screen.getByRole('columnheader', { name: 'Tokens' }),
      );

      act(() => container.setWidth(424));
      expect(
        screen.getByRole('columnheader', { name: 'Spend' }),
      ).toHaveAttribute('aria-sort', 'descending');
    } finally {
      container.restore();
      layout.restore();
    }
  });
});
