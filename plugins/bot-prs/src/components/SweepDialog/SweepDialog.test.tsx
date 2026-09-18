import { PropsWithChildren } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  musterApiRef,
  type MusterApi,
} from '@giantswarm/backstage-plugin-muster';

import { type MargeResult } from '../../lib/marge';
import { SweepDialog } from './SweepDialog';

const callTool = jest.fn();
const listServers = jest.fn();
const musterApi = { callTool, listServers } as unknown as MusterApi;

const summary = {
  total: 1,
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
  waiting: 0,
  skipped: 0,
  eligible: 1,
  unclassified: 0,
};

const previewOf = (repo: string, number: number): MargeResult => ({
  summary,
  eligible: [
    {
      owner: 'giantswarm',
      repo,
      number,
      title: 'chore(deps): update dependency typescript to v5.9.3',
      url: `https://github.com/giantswarm/${repo}/pull/${number}`,
      status: 'Eligible',
      kind: 'renovate',
      detail: 'dry-run: would approve, merge (squash)',
      policy: {
        sweep: true,
        update_types: { renovate: ['patch'] },
        rescue: {
          enabled: true,
          weekly: 5,
          budget_enforced: false,
          rescues_dispatched: false,
          confirm: 'per-sweep',
        },
        concurrency: { per_team: 1, per_repo: 1 },
      },
    },
  ],
});

function renderDialog(teams: string[]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: PropsWithChildren<{}>) => (
    <TestApiProvider apis={[[musterApiRef, musterApi]]}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </TestApiProvider>
  );
  render(
    <SweepDialog
      installation="gazelle"
      teams={teams}
      isOpen
      onOpenChange={jest.fn()}
    />,
    { wrapper },
  );
}

beforeEach(() => {
  callTool.mockReset();
  listServers.mockReset();
});

describe('SweepDialog', () => {
  it('previews every team in view, one call each, and applies to the previewed PRs', async () => {
    callTool.mockImplementation((_tool, args: { team: string }) =>
      Promise.resolve(
        args.team === 'bumblebee'
          ? previewOf('backstage', 2250)
          : previewOf('happa', 7),
      ),
    );

    renderDialog(['bumblebee', 'planeteers']);

    // A person in two teams gets both previewed: a sweep runs under one
    // team's policy, so two teams are two calls.
    await waitFor(() => expect(callTool).toHaveBeenCalledTimes(2));
    expect(callTool).toHaveBeenCalledWith(
      'x_marge_sweep',
      expect.objectContaining({ team: 'bumblebee', dry_run: true }),
      'gazelle',
    );
    expect(callTool).toHaveBeenCalledWith(
      'x_marge_sweep',
      expect.objectContaining({ team: 'planeteers', dry_run: true }),
      'gazelle',
    );
    expect(await screen.findByText('bumblebee')).toBeInTheDocument();
    expect(await screen.findByText('planeteers')).toBeInTheDocument();

    const confirm = await screen.findByRole('button', { name: 'Apply sweep' });
    await waitFor(() => expect(confirm).toBeEnabled());
    await userEvent.click(confirm);

    await waitFor(() =>
      expect(callTool).toHaveBeenCalledWith(
        'x_marge_sweep',
        expect.objectContaining({
          team: 'planeteers',
          prs: ['giantswarm/happa#7'],
          dry_run: false,
        }),
        'gazelle',
      ),
    );
    expect(await screen.findByText('Applied')).toBeInTheDocument();
  });

  it('keeps one team’s refusal to that team', async () => {
    callTool.mockImplementation((_tool, args: { team: string }) =>
      args.team === 'planeteers'
        ? Promise.reject(new Error('no team file for "planeteers"'))
        : Promise.resolve(previewOf('backstage', 2250)),
    );

    renderDialog(['bumblebee', 'planeteers']);

    expect(
      await screen.findByText('marge refused the run for planeteers'),
    ).toBeInTheDocument();
    // The team that answered is still previewed and still applicable.
    const confirm = await screen.findByRole('button', { name: 'Apply sweep' });
    await waitFor(() => expect(confirm).toBeEnabled());
  });
});
