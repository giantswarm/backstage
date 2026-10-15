import {
  createFrontendPlugin,
  FeatureFlagState,
  PageBlueprint,
  SubPageBlueprint,
} from '@backstage/frontend-plugin-api';
import { mockApis, renderTestApp } from '@backstage/frontend-test-utils';
import {
  ShellDocumentTitle,
  useShellScope,
} from '@giantswarm/backstage-plugin-ui-react';
import { screen, waitFor } from '@testing-library/react';
import { agentPlatformPlugin } from '@giantswarm/backstage-plugin-agent-platform';
import { navModule } from '../nav';
import { AGENT_SHELL_FLAG } from './predicates';
import { agentShellModule } from './index';

jest.mock('@giantswarm/backstage-plugin-agent-platform', () => {
  const { createRouteRef } = jest.requireActual(
    '@backstage/frontend-plugin-api',
  );
  // The section's own root, which the real page below mounts and the classic
  // sidebar's cross-link resolves.
  const { agentPlatformPlugin: actual } = jest.requireActual(
    '@giantswarm/backstage-plugin-agent-platform',
  );
  return {
    AGENT_SHELL_FLAG: 'agent-platform-shell',
    agentPlatformPlugin: {
      routes: {
        sessions: createRouteRef(),
        usage: createRouteRef(),
        agents: createRouteRef(),
        skills: createRouteRef(),
        models: createRouteRef(),
        profile: createRouteRef(),
        root: actual.routes.root,
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

/**
 * A page that reports whether shared components see the shell's scope, and
 * titles the document as a shell page does.
 */
function StubPage({ testId, children }: { testId: string; children: string }) {
  return (
    <div data-testid={testId} data-in-shell={String(useShellScope())}>
      <ShellDocumentTitle title={children} />
      {children}
    </div>
  );
}

const stubPagePlugin = createFrontendPlugin({
  pluginId: 'stub',
  extensions: [
    // A classic-portal route, outside the agent area.
    PageBlueprint.make({
      params: {
        path: '/stub',
        noHeader: true,
        loader: async () => <StubPage testId="stub-page">Stub</StubPage>,
      },
    }),
    // A route inside the agent area.
    PageBlueprint.make({
      name: 'agent-area',
      params: {
        path: '/agent-platform',
        routeRef: agentPlatformPlugin.routes.root,
        noHeader: true,
        loader: async () => <StubPage testId="agent-stub-page">Agent</StubPage>,
      },
    }),
  ],
});

// Generated class-name counters and React ids differ between two renders.
function normalized(html: string): string {
  return (
    html
      .replace(/-\d+\b/g, '-N')
      .replace(/\br\d+\b/g, 'rN')
      // React's useId counts in base 32 (`ra`, `r1f`): an id derived from
      // one (the logo's gradient, `gs-logo-ant-ra`) ends in letters once a
      // run has handed out ten ids, which follows from the tests before and
      // not from the chrome.
      .replace(/-r[0-9a-v]+(?=[")])/g, '-rN')
  );
}

function renderApp(
  flag: FeatureFlagState,
  { withShellModule = true, route = '/stub' } = {},
) {
  return renderTestApp({
    features: [
      navModule,
      ...(withShellModule ? [agentShellModule] : []),
      stubPagePlugin,
    ],
    initialRouteEntries: [route],
    apis: [
      mockApis.featureFlags({ initialStates: { [AGENT_SHELL_FLAG]: flag } }),
    ],
  });
}

afterEach(() => {
  delete document.documentElement.dataset.agentShell;
});

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

    const without = renderApp(FeatureFlagState.None, {
      withShellModule: false,
    });
    await screen.findByTestId('stub-page');
    await screen.findByRole('img', { name: 'Giant Swarm' });

    expect(normalized(without.container.innerHTML)).toBe(shellHtml);
  });

  it('keeps the classic chrome on agent-area routes while the flag is off', async () => {
    renderApp(FeatureFlagState.None, { route: '/agent-platform' });

    expect(await screen.findByTestId('agent-stub-page')).toBeInTheDocument();
    expect(screen.getByTestId('cluster-access-item')).toBeInTheDocument();
    expect(screen.queryByRole('main')).not.toBeInTheDocument();
    expect(document.documentElement).not.toHaveAttribute('data-agent-shell');
  });

  it('puts an agent-area page in the shell’s main region next to the rail while the flag is on', async () => {
    renderApp(FeatureFlagState.Active, { route: '/agent-platform' });

    const page = await screen.findByTestId('agent-stub-page');
    expect(screen.getByRole('main')).toContainElement(page);
    expect(screen.getByRole('main')).toHaveAttribute('id', 'content');
    expect(
      screen.getByRole('link', { name: 'Skip to content' }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('cluster-access-item')).not.toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute('data-agent-shell', '');
  });

  it('ends a shell page’s document title with the product', async () => {
    renderApp(FeatureFlagState.Active, { route: '/agent-platform' });

    await screen.findByTestId('agent-stub-page');
    await waitFor(() => expect(document.title).toBe('Agent · Agent Platform'));
  });

  it('keeps the classic sidebar and theme on routes outside the agent area while the flag is on', async () => {
    renderApp(FeatureFlagState.Active);

    expect(await screen.findByTestId('stub-page')).toBeInTheDocument();
    expect(screen.getByTestId('cluster-access-item')).toBeInTheDocument();
    expect(screen.queryByRole('main')).not.toBeInTheDocument();
    expect(document.getElementById('content')).toBeNull();
    expect(document.documentElement).not.toHaveAttribute('data-agent-shell');
  });

  it('cross-links the classic sidebar to the agent shell in a new tab while the flag is on', async () => {
    renderApp(FeatureFlagState.Active);

    await screen.findByTestId('stub-page');
    const crossLink = screen.getByRole('link', { name: /Agent Platform/ });
    expect(crossLink).toHaveAttribute('href', '/agent-platform');
    expect(crossLink).toHaveAttribute('target', '_blank');
  });

  it('offers no agent-shell cross-link while the flag is off', async () => {
    renderApp(FeatureFlagState.None);

    await screen.findByTestId('stub-page');
    expect(
      screen.queryByRole('link', { name: /Agent Platform/ }),
    ).not.toBeInTheDocument();
  });

  describe('per the deployment’s portals (no flag set)', () => {
    // No mocked FeatureFlagsApi: the shell module's own, config-aware one
    // decides, as in the real app.
    function renderDeployment(
      portals: { platformPortal?: boolean; agentPlatform?: boolean },
      route: string,
    ) {
      return renderTestApp({
        features: [navModule, agentShellModule, stubPagePlugin],
        initialRouteEntries: [route],
        config: {
          app: { baseUrl: 'http://localhost:3000', portals },
          backend: { baseUrl: 'http://localhost:7007' },
        },
      });
    }

    it('serves the shell with a Platform Portal cross-link when both are on', async () => {
      renderDeployment(
        { platformPortal: true, agentPlatform: true },
        '/agent-platform',
      );

      const page = await screen.findByTestId('agent-stub-page');
      expect(screen.getByRole('main')).toContainElement(page);
      expect(page).toHaveAttribute('data-in-shell', 'true');
      const portal = screen.getByRole('link', { name: 'Platform Portal' });
      expect(portal).toHaveAttribute('href', '/clusters');
      expect(portal).toHaveAttribute('target', '_blank');
      expect(document.documentElement).toHaveAttribute('data-agent-shell', '');
    });

    it('keeps the classic chrome, cross-linked, outside the agent area when both are on', async () => {
      renderDeployment({ platformPortal: true, agentPlatform: true }, '/stub');

      expect(await screen.findByTestId('stub-page')).toHaveAttribute(
        'data-in-shell',
        'false',
      );
      expect(screen.getByTestId('cluster-access-item')).toBeInTheDocument();
      expect(
        screen.getByRole('link', { name: /Agent Platform/ }),
      ).toHaveAttribute('target', '_blank');
    });

    it('serves the shell without a Platform Portal item on an agent-only deployment', async () => {
      renderDeployment(
        { platformPortal: false, agentPlatform: true },
        '/agent-platform',
      );

      const page = await screen.findByTestId('agent-stub-page');
      expect(screen.getByRole('main')).toContainElement(page);
      expect(
        screen.getByRole('navigation', { name: 'Main' }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('link', { name: 'Platform Portal' }),
      ).not.toBeInTheDocument();
      expect(document.documentElement).toHaveAttribute('data-agent-shell', '');
    });

    it('still serves a classic page reached by URL on an agent-only deployment, linking home in the same tab', async () => {
      renderDeployment({ platformPortal: false, agentPlatform: true }, '/stub');

      expect(await screen.findByTestId('stub-page')).toBeInTheDocument();
      expect(screen.queryByRole('main')).not.toBeInTheDocument();
      const home = screen.getByRole('link', { name: /Agent Platform/ });
      expect(home).toHaveAttribute('href', '/agent-platform');
      expect(home).not.toHaveAttribute('target');
    });

    it('is the classic portal everywhere on a platform-only deployment', async () => {
      renderDeployment(
        { platformPortal: true, agentPlatform: false },
        '/agent-platform',
      );

      expect(await screen.findByTestId('agent-stub-page')).toBeInTheDocument();
      expect(screen.getByTestId('cluster-access-item')).toBeInTheDocument();
      expect(screen.queryByRole('main')).not.toBeInTheDocument();
      expect(
        screen.queryByRole('navigation', { name: 'Main' }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('link', { name: /Agent Platform/ }),
      ).not.toBeInTheDocument();
      expect(document.documentElement).not.toHaveAttribute('data-agent-shell');
    });
  });
});

describe('the Agent Platform per portal mode', () => {
  // The real `page:agent-platform` (the module mock above stands in for the
  // package everywhere else), with one stubbed section. Enabled by default, so
  // the portal mode alone decides; the off cases also list it in
  // `app.extensions`, as the base app-config does, to show that changes
  // nothing. No mocked FeatureFlagsApi: the deployment's `app.portals`
  // decides, through the shell module's own one.
  const { agentPlatformPlugin: realAgentPlatformPlugin } = jest.requireActual(
    '@giantswarm/backstage-plugin-agent-platform',
  );
  const agentPlatform = createFrontendPlugin({
    pluginId: 'agent-platform',
    extensions: [
      realAgentPlatformPlugin.getExtension('page:agent-platform'),
      SubPageBlueprint.make({
        name: 'sessions',
        params: {
          path: 'sessions',
          title: 'Sessions',
          loader: async () => <div>Sessions content</div>,
        },
      }),
    ],
  });

  // Only the classic route: the agent-area stub above would answer
  // `/agent-platform/**` itself.
  const classicPagePlugin = createFrontendPlugin({
    pluginId: 'stub',
    extensions: [
      PageBlueprint.make({
        params: {
          path: '/stub',
          noHeader: true,
          loader: async () => <StubPage testId="stub-page">Stub</StubPage>,
        },
      }),
    ],
  });

  function renderPortal(
    portals: { platformPortal?: boolean; agentPlatform?: boolean },
    route: string,
    extensions: string[] = [],
  ) {
    return renderTestApp({
      features: [navModule, agentShellModule, classicPagePlugin, agentPlatform],
      initialRouteEntries: [route],
      config: {
        app: {
          baseUrl: 'http://localhost:3000',
          portals,
          extensions,
        },
        backend: { baseUrl: 'http://localhost:7007' },
      },
    });
  }

  describe('with the Agent Platform off (unset or false)', () => {
    it.each([
      [{}, []],
      [{ agentPlatform: false }, []],
      [{}, ['page:agent-platform']],
    ])(
      'draws nothing of it in the classic portal (%j, extensions %j)',
      async (portals, extensions) => {
        renderPortal(portals, '/stub', extensions);

        expect(await screen.findByTestId('stub-page')).toBeInTheDocument();
        expect(screen.getByTestId('cluster-access-item')).toBeInTheDocument();
        expect(screen.queryByText(/Agent Platform/)).not.toBeInTheDocument();
      },
    );

    it.each([[[]], [['page:agent-platform']]])(
      'routes none of its pages, in classic chrome or any other (extensions %j)',
      async extensions => {
        renderPortal({}, '/agent-platform/sessions', extensions);

        expect(await screen.findByText(/not found/i)).toBeInTheDocument();
        expect(screen.queryByText('Sessions content')).not.toBeInTheDocument();
        expect(screen.getByTestId('cluster-access-item')).toBeInTheDocument();
        expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
        expect(screen.queryByText(/Agent Platform/)).not.toBeInTheDocument();
      },
    );
  });

  describe('with the Agent Platform on', () => {
    it('gives the classic portal one sidebar link to the new UI and nothing else', async () => {
      renderPortal({ platformPortal: true, agentPlatform: true }, '/stub');

      expect(await screen.findByTestId('stub-page')).toBeInTheDocument();
      const links = screen.getAllByRole('link', { name: /Agent Platform/ });
      expect(links).toHaveLength(1);
      expect(links[0]).toHaveAttribute('href', '/agent-platform');
      expect(links[0]).toHaveAttribute('target', '_blank');
    });

    it('renders its pages in the shell only, never in classic chrome, with no app.extensions entry', async () => {
      renderPortal(
        { platformPortal: true, agentPlatform: true },
        '/agent-platform/sessions',
      );

      const content = await screen.findByText('Sessions content');
      expect(screen.getByRole('main')).toContainElement(content);
      expect(
        screen.getByRole('navigation', { name: 'Main' }),
      ).toBeInTheDocument();
      expect(
        screen.queryByTestId('cluster-access-item'),
      ).not.toBeInTheDocument();
      // No classic page header or tab strip.
      expect(
        screen.queryByRole('heading', { level: 1, name: 'Agent Platform' }),
      ).not.toBeInTheDocument();
      expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
      // The way back to the classic portal.
      expect(
        screen.getByRole('link', { name: 'Platform Portal' }),
      ).toHaveAttribute('href', '/clusters');
    });
  });
});
