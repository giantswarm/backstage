import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  musterApiRef,
  type MusterApi,
} from '@giantswarm/backstage-plugin-muster';

import { type MargeEntry, type MargeResult } from '../../lib/marge';
import { BotPrsPage } from './BotPrsPage';

// The page mounts a whole test app, the filters column and the table, so a
// case here costs several seconds under a parallel run.
jest.setTimeout(30_000);

jest.mock('@giantswarm/backstage-plugin-muster', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-muster'),
  useServerSignIn: () => ({ isConnected: true }),
}));

jest.mock('../../hooks/useTeams', () => ({
  useTeams: () => ({
    teams: ['bumblebee'],
    ownTeams: ['bumblebee'],
    defaultTeam: 'bumblebee',
    isLoading: false,
  }),
}));

jest.mock('../../hooks/useMarge', () => ({
  ...jest.requireActual('../../hooks/useMarge'),
  useMargeInstallation: () => ({
    installation: 'gazelle',
    candidates: ['gazelle'],
    isResolvedFromAll: false,
    isLoading: false,
    isUnavailable: false,
  }),
  useMargeServerName: () => 'marge',
}));

const callTool = jest.fn();
const listServers = jest.fn();
const musterApi = { callTool, listServers } as unknown as MusterApi;

const summary = {
  total: 3,
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
  eligible: 3,
  unclassified: 0,
};

const entry = (repo: string, number: number): MargeEntry => ({
  owner: 'giantswarm',
  repo,
  number,
  title: 'chore(deps): update dependency typescript to v5.9.3',
  url: `https://github.com/giantswarm/${repo}/pull/${number}`,
  status: 'Eligible',
  kind: 'renovate',
});

const queue: MargeResult = {
  summary,
  eligible: [
    entry('openssf-scorecard-exporter', 41),
    entry('openssf-scorecard-exporter', 44),
    entry('happa', 7),
  ],
};

/** The dry run answers whatever the caller narrowed the sweep to. */
const previewOf = (prs: string[] | undefined): MargeResult => ({
  summary: { ...summary, total: prs?.length ?? 3, eligible: prs?.length ?? 3 },
  eligible: (queue.eligible ?? []).filter(
    listed =>
      !prs || prs.includes(`${listed.owner}/${listed.repo}#${listed.number}`),
  ),
});

function renderPage(search: string = '') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return renderInTestApp(
    <TestApiProvider apis={[[musterApiRef, musterApi]]}>
      <QueryClientProvider client={queryClient}>
        <BotPrsPage />
      </QueryClientProvider>
    </TestApiProvider>,
    { routeEntries: [`/bot-prs${search}`] },
  );
}

const sweepCalls = () =>
  callTool.mock.calls.filter(([tool]) => tool === 'x_marge_sweep');

beforeEach(() => {
  callTool.mockReset();
  listServers.mockReset();
  callTool.mockImplementation(
    (tool: string, args: { prs?: string[]; refresh?: boolean }) =>
      tool === 'x_marge_list'
        ? Promise.resolve({ teams: [{ team: 'bumblebee', result: queue }] })
        : Promise.resolve(previewOf(args.prs)),
  );
});

describe('BotPrsPage', () => {
  it('sweeps the filtered view alone, and not the whole team', async () => {
    // What Franco reported: one repository filtered, and the preview listed
    // every PR of the team.
    await renderPage('?repository=giantswarm/openssf-scorecard-exporter');

    const preview = await screen.findByRole('button', {
      name: 'Preview sweep (2)',
    });
    await userEvent.click(preview);

    await waitFor(() => expect(sweepCalls()).toHaveLength(1));
    expect(sweepCalls()[0][1]).toMatchObject({
      team: 'bumblebee',
      prs: [
        'giantswarm/openssf-scorecard-exporter#41',
        'giantswarm/openssf-scorecard-exporter#44',
      ],
      dry_run: true,
    });
    expect(screen.queryByText('giantswarm/happa#7')).not.toBeInTheDocument();
  });

  it('drops a PR the person ticked off from every button', async () => {
    await renderPage();

    expect(
      await screen.findByRole('button', { name: 'Preview sweep (3)' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Approve and merge 3 green PRs' }),
    ).toBeInTheDocument();

    // The two buttons clear and restore the whole view in one act.
    await userEvent.click(screen.getByRole('button', { name: 'Select none' }));
    expect(
      await screen.findByRole('button', { name: 'Preview sweep (0)' }),
    ).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Select all' }));
    expect(
      await screen.findByRole('button', { name: 'Preview sweep (3)' }),
    ).toBeEnabled();

    await userEvent.click(
      screen.getByRole('checkbox', { name: 'Select giantswarm/happa#7' }),
    );

    expect(
      await screen.findByRole('button', { name: 'Preview sweep (2)' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Approve and merge 2 green PRs' }),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: 'Preview sweep (2)' }),
    );
    await waitFor(() => expect(sweepCalls()).toHaveLength(1));
    expect(sweepCalls()[0][1].prs).toEqual([
      'giantswarm/openssf-scorecard-exporter#41',
      'giantswarm/openssf-scorecard-exporter#44',
    ]);
  });

  it('reads the queue again without a page reload', async () => {
    await renderPage();

    await screen.findByRole('button', { name: 'Preview sweep (3)' });
    const listCalls = () =>
      callTool.mock.calls.filter(([tool]) => tool === 'x_marge_list').length;
    const before = listCalls();

    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    await waitFor(() => expect(listCalls()).toBeGreaterThan(before));
  });
});
