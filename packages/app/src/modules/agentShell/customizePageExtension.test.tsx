import {
  createFrontendPlugin,
  createRouteRef as createTabRouteRef,
  createSubRouteRef,
  FeatureFlagState,
  SubPageBlueprint,
  useRouteRef,
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
        skills: createRouteRef(),
        models: createRouteRef(),
        profile: createRouteRef(),
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
  ClusterAccessStatusSidebarItem: () => null,
}));

jest.mock('@backstage/plugin-user-settings', () => ({
  UserSettingsSignInAvatar: () => null,
  Settings: () => null,
}));

// The page, reduced to what this extension hands it: each attached sub-page
// routed below its path.
jest.mock('./CustomizePage', () => ({
  CustomizePage: ({
    pages = [],
  }: {
    pages?: { path: string; element: JSX.Element }[];
  }) => {
    const { Route, Routes } = jest.requireActual('react-router-dom');
    return (
      <div data-testid="customize-page">
        <Routes>
          {pages.map(page => (
            <Route
              key={page.path}
              path={`${page.path}/*`}
              element={page.element}
            />
          ))}
          <Route path="*" element={null} />
        </Routes>
      </div>
    );
  },
}));

// A plugin's tab, attached to the Customize page by its id, as
// agent-platform's and muster's are.
const gadgetsRouteRef = createTabRouteRef();
const gadgetRouteRef = createSubRouteRef({
  path: '/:name',
  parent: gadgetsRouteRef,
});

function Gadgets() {
  const gadget = useRouteRef(gadgetRouteRef);
  return <p>{`Gadgets sub-page, linking ${gadget?.({ name: 'g1' })}`}</p>;
}

const gadgetsPlugin = createFrontendPlugin({
  pluginId: 'gadgets',
  extensions: [
    SubPageBlueprint.make({
      name: 'gadgets',
      attachTo: { id: 'page:app/agent-shell-customize', input: 'pages' },
      params: {
        path: 'gadgets',
        title: 'Gadgets',
        routeRef: gadgetsRouteRef,
        loader: async () => <Gadgets />,
      },
    }),
  ],
});

function renderCustomize(flag: FeatureFlagState, path = '/customize') {
  return renderTestApp({
    features: [navModule, agentShellModule, gadgetsPlugin],
    initialRouteEntries: [path],
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

  it("routes an attached tab's pages below its path, its route refs resolving there", async () => {
    renderCustomize(FeatureFlagState.Active, '/customize/gadgets/g1');

    expect(
      await screen.findByText(
        'Gadgets sub-page, linking /customize/gadgets/g1',
      ),
    ).toBeInTheDocument();
    expect(screen.getByTestId('customize-page')).toContainElement(
      screen.getByText(/^Gadgets sub-page/),
    );
  });

  it('is not found while the flag is off', async () => {
    renderCustomize(FeatureFlagState.None);

    expect(await screen.findByText(/page not found/i)).toBeInTheDocument();
    expect(screen.queryByTestId('customize-page')).not.toBeInTheDocument();
    expect(document.getElementById('content')).toBeNull();
  });
});
