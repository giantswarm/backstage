import { FeatureFlagState } from '@backstage/frontend-plugin-api';
import { mockApis, renderTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import { AGENT_SHELL_FLAG } from './predicates';
import { agentShellModule } from './index';

jest.mock('@giantswarm/backstage-plugin-agent-platform', () => {
  const { createRouteRef } = jest.requireActual(
    '@backstage/frontend-plugin-api',
  );
  return {
    AGENT_SHELL_FLAG: 'agent-platform-shell',
    agentPlatformPlugin: {
      routes: { sessions: createRouteRef(), usage: createRouteRef() },
    },
    RecentSessions: () => null,
  };
});

jest.mock('@giantswarm/backstage-plugin-gs', () => ({
  ClusterAccessConnector: () => null,
}));

jest.mock('./CustomizePage', () => ({
  CustomizePage: () => <div data-testid="customize-page" />,
}));

function renderCustomize(flag: FeatureFlagState) {
  return renderTestApp({
    features: [agentShellModule],
    initialRouteEntries: ['/customize'],
    apis: [
      mockApis.featureFlags({ initialStates: { [AGENT_SHELL_FLAG]: flag } }),
    ],
  });
}

describe('the page at /customize', () => {
  it('is the Customize page while the agent shell flag is on', async () => {
    renderCustomize(FeatureFlagState.Active);

    expect(await screen.findByTestId('customize-page')).toBeInTheDocument();
    expect(screen.getByRole('main')).toContainElement(
      screen.getByTestId('customize-page'),
    );
    expect(screen.getByRole('link', { name: 'Customize' })).toHaveAttribute(
      'href',
      '/customize',
    );
  });

  it('is not found while the flag is off', async () => {
    renderCustomize(FeatureFlagState.None);

    expect(await screen.findByText(/page not found/i)).toBeInTheDocument();
    expect(screen.queryByTestId('customize-page')).not.toBeInTheDocument();
    expect(document.getElementById('content')).toBeNull();
  });
});
