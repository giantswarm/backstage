import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderInTestApp } from '@backstage/test-utils';

import { rowsOf, type MargeEntry, type MargeResult } from '../../lib/marge';
import { BotPrsTable } from './BotPrsTable';

const summary = {
  total: 1,
  merged: 0,
  auto_merge: 0,
  remedied: 0,
  failed: 1,
  security_failures: 0,
  ci_unavailable: 0,
  ci_no_verdict: 0,
  stale: 0,
  refreshed: 0,
  cancelled: 0,
  retried: 0,
  obsolete: 0,
  waiting: 0,
  skipped: 0,
  eligible: 0,
  unclassified: 0,
};

const entry = (extra: Partial<MargeEntry> = {}): MargeEntry => ({
  owner: 'giantswarm',
  repo: 'agent-platform',
  number: 548,
  title:
    'chore(deps): update gsoci.azurecr.io/giantswarm/pause docker tag to v3.10.2',
  url: 'https://github.com/giantswarm/agent-platform/pull/548',
  status: 'Failed',
  kind: 'renovate',
  ...extra,
});

const rowsWith = (extra: Partial<MargeEntry> = {}) =>
  rowsOf(
    { summary, action_required: [entry(extra)] } as MargeResult,
    'bumblebee',
  );

const twoRows = () =>
  rowsOf(
    {
      summary,
      action_required: [entry(), entry({ repo: 'happa', number: 7 })],
    } as MargeResult,
    'bumblebee',
  );

const allOf = (rows: ReturnType<typeof rowsWith>) =>
  new Set(rows.map(row => row.ref));

const props = {
  showTeam: false,
  isLoading: false,
  canAct: true,
  onSweep: jest.fn(),
  onMarkBlocked: jest.fn(),
  selectedRefs: new Set<string>(),
  onToggle: jest.fn(),
  onToggleAll: jest.fn(),
};

describe('BotPrsTable', () => {
  it('drops the columns nothing in view fills', async () => {
    // A stored read carries neither the update type nor a rescue marker:
    // both need the PR itself, which only a live classification reads.
    await renderInTestApp(<BotPrsTable {...props} rows={rowsWith()} />);

    expect(screen.getByText('Classification')).toBeInTheDocument();
    expect(screen.queryByText('Update')).not.toBeInTheDocument();
    expect(screen.queryByText('Rescue')).not.toBeInTheDocument();
  });

  it('shows a column as soon as one row fills it', async () => {
    await renderInTestApp(
      <BotPrsTable
        {...props}
        rows={rowsWith({
          update_type: 'patch',
          rescue: { outcome: 'failed', stale: false, rebased: false },
        })}
      />,
    );

    expect(screen.getByText('Update')).toBeInTheDocument();
    expect(screen.getByText('Rescue')).toBeInTheDocument();
  });

  it('narrows to a classification when one is clicked, and clears it on a second click', async () => {
    const onClassification = jest.fn();
    const { rerender } = await renderInTestApp(
      <BotPrsTable
        {...props}
        rows={rowsWith()}
        onClassification={onClassification}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /Failed/ }));
    expect(onClassification).toHaveBeenLastCalledWith('action_required');

    rerender(
      <BotPrsTable
        {...props}
        rows={rowsWith()}
        classification="action_required"
        onClassification={onClassification}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /Failed/ }));
    expect(onClassification).toHaveBeenLastCalledWith(undefined);
  });

  it('drops one PR from the selection without opening its record', async () => {
    const rows = twoRows();
    const onToggle = jest.fn();
    await renderInTestApp(
      <BotPrsTable
        {...props}
        rows={rows}
        selectedRefs={allOf(rows)}
        onToggle={onToggle}
      />,
    );

    await userEvent.click(
      screen.getByRole('checkbox', {
        name: 'Select giantswarm/agent-platform#548',
      }),
    );

    expect(onToggle).toHaveBeenCalledWith(
      'giantswarm/agent-platform#548',
      false,
    );
    // The tick is not the row: it must not expand the record under it.
    expect(
      screen.queryByTestId('details-giantswarm/agent-platform#548'),
    ).not.toBeInTheDocument();
  });

  it('offers the whole view from the header, and says how many are left', async () => {
    const rows = twoRows();
    const onToggleAll = jest.fn();
    const { rerender } = await renderInTestApp(
      <BotPrsTable
        {...props}
        rows={rows}
        selectedRefs={allOf(rows)}
        onToggleAll={onToggleAll}
      />,
    );

    await userEvent.click(
      screen.getByRole('checkbox', { name: 'Deselect every PR' }),
    );
    expect(onToggleAll).toHaveBeenCalledWith(false);

    // A ref keeps its tick when the queue hands back new row objects, which
    // it does on every read.
    rerender(
      <BotPrsTable
        {...props}
        rows={twoRows()}
        selectedRefs={new Set(['giantswarm/happa#7'])}
        onToggleAll={onToggleAll}
      />,
    );
    expect(
      screen.getByRole('checkbox', { name: 'Select giantswarm/happa#7' }),
    ).toBeChecked();
    expect(screen.getByText(/Bot PRs \(2, 1 selected\)/)).toBeInTheDocument();
  });
});
