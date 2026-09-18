import { PropsWithChildren } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  musterApiRef,
  type MusterApi,
} from '@giantswarm/backstage-plugin-muster';

import { rowsOf, type MargeResult } from '../../lib/marge';
import { MergeGreenDialog } from './MergeGreenDialog';

const callTool = jest.fn();
const listServers = jest.fn();
const musterApi = { callTool, listServers } as unknown as MusterApi;

const summary = {
  total: 2,
  merged: 0,
  auto_merge: 0,
  remedied: 0,
  failed: 0,
  security_failures: 0,
  ci_unavailable: 0,
  ci_no_verdict: 0,
  stale: 0,
  refreshed: 0,
  cancelled: 0,
  retried: 0,
  obsolete: 0,
  waiting: 1,
  skipped: 0,
  eligible: 1,
  unclassified: 0,
};

/** One green PR and one that waits on a check: only the green one is a target. */
const queue: MargeResult = {
  summary,
  eligible: [
    {
      owner: 'giantswarm',
      repo: 'backstage',
      number: 2250,
      title: 'chore(deps): update dependency typescript to v5.9.3',
      url: 'https://github.com/giantswarm/backstage/pull/2250',
      status: 'Eligible',
      kind: 'renovate',
      update_type: 'patch',
    },
  ],
  waiting: [
    {
      owner: 'giantswarm',
      repo: 'marge',
      number: 111,
      title: 'chore(deps): update module golang.org/x/net to v0.46.0',
      url: 'https://github.com/giantswarm/marge/pull/111',
      status: 'Waiting',
      kind: 'renovate',
    },
  ],
};

const preview: MargeResult = {
  summary: { ...summary, total: 1, waiting: 0 },
  eligible: [
    {
      ...queue.eligible![0],
      detail: 'dry-run: would approve, merge (squash)',
    },
  ],
};

const rows = rowsOf(queue, 'bumblebee');

function renderDialog() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const onOpenChange = jest.fn();
  const wrapper = ({ children }: PropsWithChildren<{}>) => (
    <TestApiProvider apis={[[musterApiRef, musterApi]]}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </TestApiProvider>
  );
  render(
    <MergeGreenDialog
      installation="gazelle"
      rows={rows}
      isOpen
      onOpenChange={onOpenChange}
    />,
    { wrapper },
  );
  return { onOpenChange };
}

beforeEach(() => {
  callTool.mockReset();
  listServers.mockReset();
});

describe('MergeGreenDialog', () => {
  it('previews approve and merge on the green PRs alone, then applies to the previewed ones', async () => {
    callTool.mockResolvedValue(preview);
    renderDialog();

    await waitFor(() => expect(callTool).toHaveBeenCalled());
    expect(callTool).toHaveBeenCalledWith(
      'x_marge_sweep',
      {
        team: 'bumblebee',
        prs: ['giantswarm/backstage#2250'],
        actions: 'approve,merge,mark',
        dry_run: true,
      },
      'gazelle',
    );

    const confirm = await screen.findByRole('button', {
      name: 'Approve and merge 1 PR',
    });
    await waitFor(() => expect(confirm).toBeEnabled());
    await userEvent.click(confirm);

    await waitFor(() =>
      expect(callTool).toHaveBeenLastCalledWith(
        'x_marge_sweep',
        {
          team: 'bumblebee',
          prs: ['giantswarm/backstage#2250'],
          actions: 'approve,merge,mark',
          dry_run: false,
        },
        'gazelle',
      ),
    );
    expect(await screen.findByText('Applied')).toBeInTheDocument();
  });

  it('reports the engine’s refusal and offers nothing to apply', async () => {
    callTool.mockRejectedValue(new Error('marge: no team file for "atlas"'));
    renderDialog();

    expect(
      await screen.findByText('marge refused the run for bumblebee'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Approve and merge 0 PRs' }),
    ).toBeDisabled();
  });
});
