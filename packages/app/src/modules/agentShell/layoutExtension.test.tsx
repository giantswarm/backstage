import {
  createFrontendPlugin,
  FeatureFlagState,
  PageBlueprint,
} from '@backstage/frontend-plugin-api';
import { mockApis, renderTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import { navModule } from '../nav';
import { AGENT_SHELL_FLAG } from './predicates';
import { agentShellModule } from './index';

jest.mock('@giantswarm/backstage-plugin-agent-platform', () => {
  const { createRouteRef } = jest.requireActual(
    '@backstage/frontend-plugin-api',
  );
  return {
    AGENT_SHELL_FLAG: 'agent-platform-shell',
    agentPlatformPlugin: {
      routes: {
        sessions: createRouteRef(),
        usage: createRouteRef(),
        agents: createRouteRef(),
        models: createRouteRef(),
      },
    },
    RecentSessions: () => null,
  };
});

jest.mock('@giantswarm/backstage-plugin-muster', () => {
  const { createRouteRef } = jest.requireActual(
    '@backstage/frontend-plugin-api',
  );
  return {
    __esModule: true,
    default: {
      routes: { mcpServers: createRouteRef(), workflows: createRouteRef() },
    },
  };
});

jest.mock('@giantswarm/backstage-plugin-gs', () => ({
  ClusterAccessConnector: () => null,
  ClusterAccessStatusSidebarItem: () => (
    <div data-testid="cluster-access-item" />
  ),
}));

jest.mock('@backstage/plugin-user-settings', () => ({
  UserSettingsSignInAvatar: () => null,
  Settings: () => null,
}));

const stubPagePlugin = createFrontendPlugin({
  pluginId: 'stub',
  extensions: [
    PageBlueprint.make({
      params: {
        path: '/stub',
        noHeader: true,
        loader: async () => <div data-testid="stub-page">Stub</div>,
      },
    }),
  ],
});

// Generated class-name counters and React ids differ between two renders.
function normalized(html: string): string {
  return html.replace(/-\d+\b/g, '-N').replace(/\br\d+\b/g, 'rN');
}

function renderApp(flag: FeatureFlagState, withShellModule = true) {
  return renderTestApp({
    features: [
      navModule,
      ...(withShellModule ? [agentShellModule] : []),
      stubPagePlugin,
    ],
    initialRouteEntries: ['/stub'],
    apis: [
      mockApis.featureFlags({ initialStates: { [AGENT_SHELL_FLAG]: flag } }),
    ],
  });
}

describe('the app layout', () => {
  it('renders the classic sidebar and the page as before while the flag is off', async () => {
    renderApp(FeatureFlagState.None);

    expect(await screen.findByTestId('stub-page')).toBeInTheDocument();
    expect(screen.getByTestId('cluster-access-item')).toBeInTheDocument();
    expect(screen.queryByRole('main')).not.toBeInTheDocument();
    expect(document.getElementById('content')).toBeNull();
  });

  it('adds nothing to the DOM while the flag is off', async () => {
    const withShell = renderApp(FeatureFlagState.None);
    await screen.findByTestId('stub-page');
    await screen.findByRole('img', { name: 'Giant Swarm' });
    const shellHtml = normalized(withShell.container.innerHTML);
    withShell.unmount();

    const without = renderApp(FeatureFlagState.None, false);
    await screen.findByTestId('stub-page');
    await screen.findByRole('img', { name: 'Giant Swarm' });

    expect(normalized(without.container.innerHTML)).toBe(shellHtml);
  });

  it('puts the page in the shell’s main region next to the rail while the flag is on', async () => {
    renderApp(FeatureFlagState.Active);

    const page = await screen.findByTestId('stub-page');
    expect(screen.getByRole('main')).toContainElement(page);
    expect(screen.getByRole('main')).toHaveAttribute('id', 'content');
    expect(
      screen.getByRole('link', { name: 'Skip to content' }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('cluster-access-item')).not.toBeInTheDocument();
  });
});
