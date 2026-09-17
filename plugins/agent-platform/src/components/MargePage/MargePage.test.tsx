import { Route, Routes } from 'react-router-dom';
import { screen, within } from '@testing-library/react';
import { renderInTestApp } from '@backstage/frontend-test-utils';

import { MargeNotConnectedError, type MargeResult } from '../../lib/marge';
import { margeRouteRef } from '../../routes';
import { MargePage } from './MargePage';

const mockUseMargeInstallation = jest.fn();
const mockUseBotPrs = jest.fn();

jest.mock('../../hooks/useMarge', () => ({
  useMargeInstallation: () => mockUseMargeInstallation(),
  useBotPrs: () => mockUseBotPrs(),
  useMargeSweep: () => ({
    result: undefined,
    isDryRun: true,
    isPending: false,
    error: null,
    run: jest.fn(),
    reset: jest.fn(),
  }),
  useMargeRemedy: () => ({
    result: undefined,
    isDryRun: true,
    isPending: false,
    error: null,
    run: jest.fn(),
    reset: jest.fn(),
  }),
  useMargeMark: () => ({
    result: undefined,
    isPending: false,
    error: null,
    run: jest.fn(),
    reset: jest.fn(),
  }),
}));

jest.mock('../../hooks/useTeams', () => ({
  useTeams: () => ({
    teams: ['bumblebee', 'atlas'],
    ownTeams: ['bumblebee'],
    defaultTeam: 'bumblebee',
    isLoading: false,
  }),
}));

// The sign-in affordance and its status poll are the muster plugin's; here
// they are a labelled stand-in so the gate's presence is what is asserted.
jest.mock('@giantswarm/backstage-plugin-muster', () => ({
  ServerSignIn: ({ serverName }: { serverName: string }) => (
    <button>Sign in to {serverName}</button>
  ),
  useServerSignIn: () => ({ isConnected: false }),
}));

jest.mock('@giantswarm/backstage-plugin-ui-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-ui-react'),
  StatusLabel: ({ label }: { label: string }) => <span>{label}</span>,
}));

const queue = (
  overrides: Partial<ReturnType<typeof mockUseBotPrs>> & {
    result?: MargeResult;
  },
) => ({
  result: undefined,
  mode: 'stored',
  readAt: undefined,
  isLoading: false,
  isRefreshing: false,
  error: null,
  reload: jest.fn(),
  refresh: jest.fn(),
  ...overrides,
});

const reachable = {
  installation: 'agent-platform',
  candidates: ['agent-platform'],
  missing: [],
  isResolvedFromAll: false,
  isLoading: false,
  isUnavailable: false,
};

const summary = {
  total: 2,
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
  unclassified: 1,
};

const stored: MargeResult = {
  summary,
  action_required: [
    {
      owner: 'giantswarm',
      repo: 'klaus-operator',
      number: 37,
      title: 'Update dependency typescript to v7',
      url: 'https://github.com/giantswarm/klaus-operator/pull/37',
      status: 'Failed',
      detail: 'stored by the last sweep',
      kind: 'renovate',
      label: 'marge/action-required',
      age_days: 3,
    },
  ],
  unclassified: [
    {
      owner: 'giantswarm',
      repo: 'backstage',
      number: 2250,
      title: 'Update dependency typescript to v7',
      url: 'https://github.com/giantswarm/backstage/pull/2250',
      status: 'Unclassified',
      detail: 'no sweep has classified this PR',
      kind: 'renovate',
      age_days: 0,
    },
  ],
};

function render(path = '/agent-platform/marge/bumblebee') {
  return renderInTestApp(
    <Routes>
      <Route path="/agent-platform/marge/:team" element={<MargePage />} />
    </Routes>,
    {
      initialRouteEntries: [path],
      mountedRoutes: { '/agent-platform/marge': margeRouteRef },
    },
  );
}

beforeEach(() => {
  mockUseMargeInstallation.mockReturnValue(reachable);
  mockUseBotPrs.mockReturnValue(queue({}));
});

describe('MargePage', () => {
  it('says the muster plugin is required when it is absent', async () => {
    mockUseMargeInstallation.mockReturnValue({
      ...reachable,
      installation: undefined,
      candidates: [],
      isUnavailable: true,
    });
    await render();
    expect(
      screen.getByText('The muster plugin is required'),
    ).toBeInTheDocument();
  });

  it('says which muster lists no marge when none in scope does', async () => {
    mockUseMargeInstallation.mockReturnValue({
      ...reachable,
      installation: undefined,
      candidates: [],
      missing: ['agent-platform'],
    });
    await render();
    expect(
      screen.getByText('No marge on this installation'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/muster on agent-platform lists no marge MCPServer/),
    ).toBeInTheDocument();
  });

  it("guides a person without a grant to marge's own sign-in and withholds the actions", async () => {
    mockUseBotPrs.mockReturnValue(
      queue({
        error: new MargeNotConnectedError(
          'authentication required: server returned 401 Unauthorized',
        ),
      }),
    );
    await render();
    expect(screen.getByText('Sign in to GitHub for marge')).toBeInTheDocument();
    expect(
      screen.getByText(/server returned 401 Unauthorized/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Sign in to marge' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Preview sweep' }),
    ).toBeDisabled();
  });

  it('renders the stored queue grouped by repository, the unclassified row as such, and the actions per PR', async () => {
    mockUseBotPrs.mockReturnValue(
      queue({ result: stored, readAt: Date.parse('2026-09-17T10:00:00Z') }),
    );
    await render();

    expect(
      screen.getByText(/2 open bot PRs for team bumblebee/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/1 PR has no stored classification/),
    ).toBeInTheDocument();

    const backstage = screen.getByRole('region', {
      name: 'giantswarm/backstage',
    });
    expect(within(backstage).getByText('Unclassified')).toBeInTheDocument();
    expect(
      within(backstage).getByText('no sweep has classified this PR'),
    ).toBeInTheDocument();
    expect(
      within(backstage).getByRole('button', {
        name: 'Actions for giantswarm/backstage#2250',
      }),
    ).toBeInTheDocument();

    const klaus = screen.getByRole('region', {
      name: 'giantswarm/klaus-operator',
    });
    expect(within(klaus).getByText('Failed')).toBeInTheDocument();
    expect(within(klaus).getByText('3 d')).toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Preview sweep' })).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Refresh classification' }),
    ).toBeEnabled();
  });

  it("shows marge's refusal of the read verbatim", async () => {
    mockUseBotPrs.mockReturnValue(
      queue({ error: new Error('no team file for "bumblebee"') }),
    );
    await render();
    expect(screen.getByText('marge refused the read')).toBeInTheDocument();
    expect(
      screen.getByText('no team file for "bumblebee"'),
    ).toBeInTheDocument();
  });
});
