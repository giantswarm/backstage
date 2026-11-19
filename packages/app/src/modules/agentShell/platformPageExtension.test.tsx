import { FeatureFlagState } from '@backstage/frontend-plugin-api';
import { mockApis, renderTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import { navModule } from '../nav';
import { AGENT_SHELL_FLAG } from './predicates';
import { PLATFORM_SECTION_FLAG } from './platformSection';
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
        skills: createRouteRef(),
        models: createRouteRef(),
        profile: createRouteRef(),
        organizations: createRouteRef(),
      },
    },
    RecentSessions: () => null,
    useOrganizationsAvailable: () => false,
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
  gsAuthProvidersApiRef: { id: 'plugin.gs.auth-providers' },
  useMainSessionEnd: () => undefined,
  ClusterAccessConnector: () => null,
  ClusterAccessStatusSidebarItem: () => null,
}));

jest.mock('@backstage/plugin-user-settings', () => ({
  UserSettingsSignInAvatar: () => null,
  Settings: () => null,
}));

jest.mock('./PlatformPage', () => ({
  PlatformPage: () => <div data-testid="platform-page" />,
}));

function renderAt(path: string, { section }: { section: boolean }) {
  return renderTestApp({
    features: [navModule, agentShellModule],
    initialRouteEntries: [path],
    // The test app's own config is replaced, so it carries what the nav reads.
    config: {
      app: { baseUrl: 'http://localhost:3000' },
      backend: { baseUrl: 'http://localhost:7007' },
      ...(section && {
        gs: { features: { platformSection: { enabled: true } } },
      }),
    },
    apis: [
      mockApis.featureFlags({
        initialStates: {
          [AGENT_SHELL_FLAG]: FeatureFlagState.Active,
          ...(section && {
            [PLATFORM_SECTION_FLAG]: FeatureFlagState.Active,
          }),
        },
      }),
    ],
  });
}

describe('the Platform section', () => {
  it('is the Platform page at /platform, in the shell, where the deployment turned it on', async () => {
    renderAt('/platform/clusters', { section: true });

    expect(await screen.findByTestId('platform-page')).toBeInTheDocument();
    expect(screen.getByRole('main')).toContainElement(
      screen.getByTestId('platform-page'),
    );
    expect(screen.getByRole('link', { name: 'Platform' })).toHaveAttribute(
      'href',
      '/platform',
    );
  });

  it('has neither a route nor a rail item while it is off', async () => {
    renderAt('/platform/clusters', { section: false });

    expect(await screen.findByText(/page not found/i)).toBeInTheDocument();
    expect(screen.queryByTestId('platform-page')).not.toBeInTheDocument();
  });

  it('leaves the rail as it was while it is off', async () => {
    renderAt('/customize', { section: false });

    expect(
      await screen.findByRole('link', { name: 'Customize' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Platform' }),
    ).not.toBeInTheDocument();
  });
});
