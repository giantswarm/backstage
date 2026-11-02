import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { LlmOrganizationRow } from '../../../lib/llmUsage';
import { LlmByOrganizationTable } from './LlmByOrganizationTable';

const ROWS: LlmOrganizationRow[] = [
  {
    id: 'org-alpha',
    namespace: 'org-alpha',
    kind: 'organization',
    label: 'alpha',
    description: 'org-alpha',
    tokens: 7_500_000,
    calls: 120,
    costUsd: 42.5,
    sharePct: 85,
  },
  {
    id: 'kagent',
    namespace: 'kagent',
    kind: 'platform',
    label: 'None',
    tokens: 300_000,
    calls: 400,
    costUsd: 6.5,
    sharePct: 13,
  },
  {
    id: 'unattributed',
    namespace: '',
    kind: 'unattributed',
    label: 'Unattributed',
    tokens: 60_000,
    calls: 3,
    costUsd: 1,
    sharePct: 2,
  },
];

const hrefFor = (row: LlmOrganizationRow) =>
  row.kind === 'unattributed'
    ? undefined
    : `/usage/cost?organization=${row.namespace}`;

/** The organization column's cell text, top to bottom. */
function renderedOrder(): string[] {
  return screen
    .getAllByRole('rowheader')
    .map(cell => cell.textContent?.trim() ?? '');
}

describe('LlmByOrganizationTable', () => {
  it('opens sorted by spend, descending, with the namespace under an organization', () => {
    render(
      <LlmByOrganizationTable
        rows={ROWS}
        emptyMessage="none"
        hrefFor={hrefFor}
      />,
    );

    expect(renderedOrder()).toEqual(['alphaorg-alpha', 'None', 'Unattributed']);
    expect(screen.getByText('$42.50')).toBeInTheDocument();
    expect(screen.getByText('85%')).toBeInTheDocument();
  });

  it('links an organization and the platform to the narrowed view, and unattributed traffic nowhere', () => {
    render(
      <LlmByOrganizationTable
        rows={ROWS}
        emptyMessage="none"
        hrefFor={hrefFor}
      />,
    );

    expect(screen.getByRole('link', { name: 'alpha' })).toHaveAttribute(
      'href',
      '/usage/cost?organization=org-alpha',
    );
    expect(screen.getByRole('link', { name: 'None' })).toHaveAttribute(
      'href',
      '/usage/cost?organization=kagent',
    );
    expect(screen.queryByRole('link', { name: 'Unattributed' })).toBeNull();
  });

  it('re-orders the rendered rows when a column is sorted', async () => {
    render(<LlmByOrganizationTable rows={ROWS} emptyMessage="none" />);

    // A first click on a fresh column sorts ascending: the busiest
    // organization goes last.
    await userEvent.click(
      screen.getByRole('columnheader', { name: /Model calls/ }),
    );

    expect(renderedOrder()).toEqual(['Unattributed', 'alphaorg-alpha', 'None']);
  });

  it('says so when the window holds no organization', () => {
    render(
      <LlmByOrganizationTable
        rows={[]}
        emptyMessage="The gateway attributed no calls to an organization in this window."
      />,
    );

    expect(
      screen.getByText(
        'The gateway attributed no calls to an organization in this window.',
      ),
    ).toBeInTheDocument();
  });
});
