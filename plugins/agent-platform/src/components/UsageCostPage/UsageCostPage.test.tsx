import { screen } from '@testing-library/react';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { usageRouteRef } from '../../routes';
import type { LlmUsageViewModel } from '../../hooks/useLlmUsageView';
import { UsageCostPage } from './UsageCostPage';

const view: LlmUsageViewModel = {
  state: 'unavailable',
  usage: undefined,
  installation: 'gazelle',
  isResolvedFromAll: false,
  notReachable: [],
};

jest.mock('../../hooks/useLlmUsageView', () => ({
  useLlmUsageView: () => view,
}));

const sessionUsageState = {
  usage: undefined as Record<string, unknown> | undefined,
  isLoading: false,
  isError: false,
  isNotDeployed: false,
  refetch: () => {},
};

jest.mock('../../hooks/useSessionUsage', () => ({
  useSessionUsage: () => sessionUsageState,
}));

jest.mock('@giantswarm/backstage-plugin-gs-react', () => ({
  useSignedInConfig: () => ({
    config: { getOptional: () => undefined },
  }),
}));

function renderPage() {
  return renderInTestApp(<UsageCostPage />, {
    initialRouteEntries: ['/agent-platform/usage/cost'],
    mountedRoutes: { '/agent-platform/usage': usageRouteRef },
  });
}

describe('UsageCostPage without gateway metrics (mimirEnabled: false)', () => {
  beforeEach(() => {
    view.state = 'unavailable';
    sessionUsageState.usage = undefined;
    sessionUsageState.isNotDeployed = false;
  });

  it('keeps the honest empty state compact, in the platform content column', async () => {
    const { container } = await renderPage();

    expect(
      await screen.findByText(/has no observability stack/),
    ).toBeInTheDocument();
    // The ShellPage idiom: a centered max-width column, not full bleed.
    expect(
      container.querySelector('[style*="max-width: 1080px"]'),
    ).not.toBeNull();
    // No invented figures.
    expect(screen.queryByText('Reported cost')).toBeNull();
  });

  it('adds the kagent-reported cost when the runtimes reported one', async () => {
    sessionUsageState.usage = {
      totals: { reportedCostUsd: 12.5 },
      windowDays: 30,
    };

    renderPage();

    expect(await screen.findByText('Reported cost')).toBeInTheDocument();
    expect(screen.getByText('$12.50')).toBeInTheDocument();
    expect(
      screen.getByText(/your sessions, over the last 30 days/),
    ).toBeInTheDocument();
  });

  it('shows no reported cost when kagent is absent', async () => {
    sessionUsageState.isNotDeployed = true;
    sessionUsageState.usage = {
      totals: { reportedCostUsd: 12.5 },
      windowDays: 30,
    };

    renderPage();

    expect(
      await screen.findByText(/has no observability stack/),
    ).toBeInTheDocument();
    expect(screen.queryByText('Reported cost')).toBeNull();
  });
});
