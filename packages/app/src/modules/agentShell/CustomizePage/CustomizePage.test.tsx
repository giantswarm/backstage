import { renderInTestApp } from '@backstage/frontend-test-utils';
import { agentPlatformPlugin } from '@giantswarm/backstage-plugin-agent-platform';
import {
  type MockedLayout,
  mockDesktopLayout,
  mockPhoneLayout,
} from '@giantswarm/backstage-plugin-ui-react/testUtils';
import musterPlugin from '@giantswarm/backstage-plugin-muster';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import {
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom';
import { customizeRouteRef } from '../routes';
import { CUSTOMIZE_TAB_IDS } from '../customizeTabIds';
import { CUSTOMIZE_TABS, CustomizePage } from './CustomizePage';

let mockCustomizeData: Record<string, unknown>;
let mockMusterCounts: Record<string, unknown>;
let mockCanAddSkill = false;

function mockPanel(name: string) {
  return (props: { search: string }) => (
    <p>{`${name} panel, search “${props.search}”${
      // Anything beyond the search would be a filter the page hands down.
      Object.keys(props).length > 1 ? ', with more props' : ''
    }`}</p>
  );
}

jest.mock('@giantswarm/backstage-plugin-agent-platform', () => {
  const { createRouteRef, createSubRouteRef } = jest.requireActual(
    '@backstage/frontend-plugin-api',
  );
  const agents = createRouteRef();
  const skills = createRouteRef();
  const models = createRouteRef();
  const toolchains = createRouteRef();
  return {
    agentPlatformPlugin: {
      routes: {
        agents,
        newAgent: createSubRouteRef({ path: '/new', parent: agents }),
        skills,
        newSkill: createSubRouteRef({ path: '/new', parent: skills }),
        models,
        newModel: createSubRouteRef({ path: '/new', parent: models }),
        toolchains,
        newToolchain: createSubRouteRef({ path: '/new', parent: toolchains }),
      },
    },
    CustomizeDataProvider: ({ children }: { children: ReactNode }) => children,
    useCustomizeData: () => mockCustomizeData,
    useCanAddSkill: () => mockCanAddSkill,
    CustomizeAgentsPanel: mockPanel('Agents'),
    CustomizeSkillsPanel: mockPanel('Skills'),
    CustomizeModelsPanel: mockPanel('Models'),
    CustomizeWorkspacesPanel: mockPanel('Workspaces'),
    CustomizeToolchainsPanel: mockPanel('Toolchains'),
    WorkspaceOrganizationSelect: () => <p>Organization scope</p>,
    CreateWorkspaceButton: () => <a href="/new-workspace">New workspace</a>,
    CustomizeWorkspacesIntro: () => <h2>Workspaces of acme</h2>,
    WorkflowCreateAssist: ({ installation }: { installation?: string }) => (
      <p>{`Create a workflow with the agent on ${installation}`}</p>
    ),
    EnvironmentSelect: ({ component }: { component?: string }) => (
      <p>{`Environment for ${component ?? 'everything'}`}</p>
    ),
  };
});

jest.mock('@giantswarm/backstage-plugin-muster', () => {
  const { createRouteRef, createSubRouteRef } = jest.requireActual(
    '@backstage/frontend-plugin-api',
  );
  const mcpServers = createRouteRef();
  return {
    __esModule: true,
    default: {
      routes: {
        mcpServers,
        newMcpServer: createSubRouteRef({ path: '/new', parent: mcpServers }),
      },
    },
    CustomizeMusterProvider: ({ children }: { children: ReactNode }) =>
      children,
    useMusterCustomizeCounts: () => mockMusterCounts,
    CONNECTOR_GROUPS: [
      { id: 'yours', path: '', title: 'Your connectors' },
      { id: 'infrastructure', path: 'infrastructure', title: 'Infrastructure' },
      { id: 'internal', path: 'internal', title: 'Internal' },
    ],
    connectorGroupInfo: (group: string) =>
      ({
        yours: { id: 'yours', path: '', title: 'Your connectors' },
        infrastructure: {
          id: 'infrastructure',
          path: 'infrastructure',
          title: 'Infrastructure',
        },
        internal: { id: 'internal', path: 'internal', title: 'Internal' },
      })[group],
    LEGACY_CONNECTOR_GROUP_PATHS: { families: 'infrastructure' },
    CustomizeConnectorsPanel: (props: { search: string; group: string }) => (
      <p>{`Connectors panel, search “${props.search}”, ${props.group}`}</p>
    ),
    CustomizeWorkflowsPanel: ({
      createAssist,
      ...props
    }: {
      search: string;
      createAssist?: (installation: string) => ReactNode;
    }) => (
      <>
        {mockPanel('Workflows')(props)}
        {createAssist?.('gazelle')}
      </>
    ),
  };
});

const allRoutes = {
  '/customize': customizeRouteRef,
  '/customize/agents': agentPlatformPlugin.routes.agents,
  '/customize/skills': agentPlatformPlugin.routes.skills,
  '/customize/models': agentPlatformPlugin.routes.models,
  '/customize/toolchains': agentPlatformPlugin.routes.toolchains,
  '/customize/connectors': musterPlugin.routes.mcpServers,
};

function LocationProbe() {
  const { pathname, search } = useLocation();
  return <p data-testid="location">{`${pathname}${search}`}</p>;
}

/** A plugin's router below its tab, as the page's `pages` input hands it. */
function SubPage({ name }: { name: string }) {
  const rest = useParams()['*'];
  return <p>{`${name} sub-page at ${rest}`}</p>;
}

const pages = [
  { path: 'agents', element: <SubPage name="Agents" /> },
  { path: 'models', element: <SubPage name="Models" /> },
  { path: 'connectors', element: <SubPage name="Connectors" /> },
];

function renderCustomize(
  path: string,
  options: Omit<
    Parameters<typeof renderInTestApp>[1],
    'initialRouteEntries'
  > = {},
) {
  return renderInTestApp(
    <>
      <Routes>
        <Route path="/customize/*" element={<CustomizePage pages={pages} />} />
        <Route path="*" element={<p>Elsewhere</p>} />
      </Routes>
      <LocationProbe />
    </>,
    { mountedRoutes: allRoutes, ...options, initialRouteEntries: [path] },
  );
}

const tabs = () =>
  screen
    .getAllByRole('tab')
    .map(tab => [tab.textContent, tab.getAttribute('href')]);

describe('CUSTOMIZE_TABS', () => {
  it('draws exactly the tab ids telemetry reports, in strip order', () => {
    expect(CUSTOMIZE_TABS.map(tab => tab.id)).toEqual([...CUSTOMIZE_TAB_IDS]);
  });
});

describe('CustomizePage', () => {
  beforeEach(() => {
    mockCustomizeData = {
      counts: { agents: 5, skills: 71, models: 3 },
      hasSkillRepositories: true,
    };
    mockMusterCounts = {
      connectors: 7,
      connectorGroups: { yours: 3, infrastructure: 2, internal: 2 },
      workflows: 2,
    };
    mockCanAddSkill = false;
  });

  it('draws a tab per area with its count', async () => {
    await renderCustomize('/customize/agents');

    expect(
      screen.getByRole('heading', { level: 1, name: 'Customize' }),
    ).toBeInTheDocument();
    expect(tabs()).toEqual([
      ['Agents (5)', '/customize/agents'],
      ['Skills (71)', '/customize/skills'],
      ['Connectors (7)', '/customize/connectors'],
      ['Models (3)', '/customize/models'],
      ['Workflows (2)', '/customize/workflows'],
    ]);
    expect(screen.getByRole('tab', { selected: true })).toHaveTextContent(
      'Agents',
    );
  });

  it.each([
    [
      '/customize/models/gazelle/kagent/default-model',
      'Models',
      'gazelle/kagent/default-model',
    ],
    ['/customize/agents/new/skills', 'Agents', 'new/skills'],
    [
      '/customize/connectors/gazelle/jira/edit',
      'Connectors',
      'gazelle/jira/edit',
    ],
    // An installation named like a sub-tab: deeper, so a connector's page.
    ['/customize/connectors/internal/jira', 'Connectors', 'internal/jira'],
  ])(
    "routes %s below the tab's list to the plugin's sub-page, without the tab strip",
    async (path, name, rest) => {
      await renderCustomize(path);

      expect(
        screen.getByText(`${name} sub-page at ${rest}`),
      ).toBeInTheDocument();
      expect(screen.queryByRole('tab')).toBeNull();
      expect(screen.queryByText(/ panel, /)).toBeNull();
    },
  );

  it('sends an address below a tab no plugin attached to that tab', async () => {
    await renderCustomize('/customize/workspaces/a/b?installation=golem');

    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(
        /^\/customize\/workspaces\?installation=golem$/,
      ),
    );
  });

  it('leaves out a count that could not be read', async () => {
    mockCustomizeData = { ...mockCustomizeData, counts: { skills: 71 } };
    mockMusterCounts = {};
    await renderCustomize('/customize/agents');

    expect(tabs().map(([title]) => title)).toEqual([
      'Agents',
      'Skills (71)',
      'Connectors',
      'Models',
      'Workflows',
    ]);
    expect(document.querySelector('[data-count="loading"]')).toBeNull();
  });

  // The strip has its final width before the counts arrive, so no tab
  // moves under the pointer when they do.
  it('holds the place of each count still loading, the sub-tabs’ too', async () => {
    mockCustomizeData = {
      ...mockCustomizeData,
      counts: {
        agents: 'loading',
        skills: 71,
        models: 'loading',
      },
    };
    mockMusterCounts = {
      connectors: 'loading',
      connectorGroups: {
        yours: 'loading',
        infrastructure: 'loading',
        internal: 'loading',
      },
      workflows: 'loading',
    };
    await renderCustomize('/customize/connectors');

    const loading = screen
      .getAllByRole('tab')
      .filter(tab => tab.querySelector('[data-count="loading"]'))
      .map(tab => tab.textContent?.trim());
    expect(loading).toEqual([
      'Agents',
      'Connectors',
      'Models',
      'Workflows',
      'Your connectors',
      'Infrastructure',
      'Internal',
    ]);
    expect(screen.getByRole('tab', { name: 'Skills (71)' })).toBeVisible();
  });

  it.each([
    ['agents', 'Agents', 'kagent', 'New agent', '/customize/agents/new'],
    [
      'connectors',
      'Connectors',
      'muster',
      'Add connector',
      '/customize/connectors/new',
    ],
    ['models', 'Models', 'kagent', 'Connect a model', '/customize/models/new'],
  ])(
    'shows the %s panel with its environment and create action',
    async (tab, panel, component, action, href) => {
      await renderCustomize(`/customize/${tab}`);

      expect(
        screen.getByText(new RegExp(`^${panel} panel`)),
      ).toBeInTheDocument();
      expect(
        screen.getByText(`Environment for ${component}`),
      ).toBeInTheDocument();
      expect(screen.getByRole('link', { name: action })).toHaveAttribute(
        'href',
        href,
      );
    },
  );

  it('puts Add skill beside the search, as the other tabs’ create actions, where a skill can be proposed', async () => {
    mockCanAddSkill = true;
    await renderCustomize('/customize/skills');

    expect(screen.getByRole('link', { name: 'Add skill' })).toHaveAttribute(
      'href',
      '/customize/skills/new',
    );
  });

  it.each([
    ['skills', 'Skills'],
    ['workflows', 'Workflows'],
  ])('offers no create action on the %s tab', async (tab, panel) => {
    await renderCustomize(`/customize/${tab}`);

    expect(screen.getByText(new RegExp(`^${panel} panel`))).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /new|add/i }),
    ).not.toBeInTheDocument();
  });

  it.each(['agents', 'models'])(
    'is global on the %s tab: no organization filter, only the search',
    async tab => {
      await renderCustomize(`/customize/${tab}`);

      expect(screen.getByText(/panel, search “”$/)).toBeInTheDocument();
      expect(screen.queryByText(/organization/i)).not.toBeInTheDocument();
    },
  );

  it('hands the search to the panel', async () => {
    await renderCustomize('/customize/skills');

    await userEvent.type(
      screen.getByRole('searchbox', { name: 'Search skills' }),
      'report',
    );
    expect(
      screen.getByText('Skills panel, search “report”'),
    ).toBeInTheDocument();
  });

  describe('at list scale', () => {
    // T49: the five catalog tabs always carry the search, however short the
    // list — the SEARCH_MIN gate is for secondary lists only.
    it('offers the search over a short tab, beside the create action', async () => {
      // Three models.
      await renderCustomize('/customize/models');

      expect(screen.getByText('Models panel, search “”')).toBeInTheDocument();
      expect(
        screen.getByRole('searchbox', { name: 'Search models' }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('link', { name: 'Connect a model' }),
      ).toHaveAttribute('href', '/customize/models/new');
    });

    it('offers the search over a short tab without a create action', async () => {
      await renderCustomize('/customize/workflows');

      expect(
        screen.getByRole('searchbox', { name: 'Search workflows' }),
      ).toBeInTheDocument();
    });

    it('gives the workflows panel the workflow agent’s hand-off as its way to create one', async () => {
      await renderCustomize('/customize/workflows');

      expect(
        screen.getByText('Workflows panel, search “”'),
      ).toBeInTheDocument();
      expect(
        screen.getByText('Create a workflow with the agent on gazelle'),
      ).toBeInTheDocument();
    });

    it('offers the search while the tab is still counting', async () => {
      mockCustomizeData = { ...mockCustomizeData, counts: {} };
      await renderCustomize('/customize/agents');

      expect(
        screen.getByRole('searchbox', { name: 'Search agents' }),
      ).toBeInTheDocument();
    });

    it('offers the search over a long tab', async () => {
      mockCustomizeData = {
        ...mockCustomizeData,
        counts: { agents: 300, skills: 71, models: 3 },
      };
      await renderCustomize('/customize/agents');

      expect(
        screen.getByRole('searchbox', { name: 'Search agents' }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('link', { name: 'New agent' }),
      ).toBeInTheDocument();
    });

    it.each(['agents', 'skills', 'connectors', 'models', 'workflows'])(
      'searches the %s tab at any count',
      async tab => {
        mockCustomizeData = {
          ...mockCustomizeData,
          counts: { agents: 1, skills: 2, models: 0 },
        };
        mockMusterCounts = { connectors: 0, workflows: 1 };
        await renderCustomize(`/customize/${tab}`);

        expect(screen.getByRole('searchbox')).toBeInTheDocument();
      },
    );
  });

  describe('at phone width (T22 P1)', () => {
    let layout: MockedLayout;
    afterEach(() => layout.restore());
    /** The box the search field sits in, which sets its share of the row. */
    const searchBox = (name: string) =>
      screen
        .getByRole('searchbox', { name })
        .closest('div[style]') as HTMLElement;

    it('gives the search and the create action a full-width line each', async () => {
      layout = mockPhoneLayout();
      await renderCustomize('/customize/agents');

      // The search's 360px basis is wider than a phone's 343px content: the
      // action used to wrap under it, left-aligned.
      expect(searchBox('Search agents').style.flex).toBe('1 1 100%');
      expect(screen.getByRole('link', { name: 'New agent' })).toHaveStyle({
        width: '100%',
      });
      expect(screen.getByText('Agents panel, search “”')).toBeInTheDocument();
    });

    it('keeps the search at 360px beside the action on a wide viewport', async () => {
      layout = mockDesktopLayout();
      await renderCustomize('/customize/agents');

      expect(searchBox('Search agents').style.flex).toBe('0 1 360px');
      expect(screen.getByRole('link', { name: 'New agent' }).style.width).toBe(
        '',
      );
    });
  });

  describe('a search in the address', () => {
    it('opens the tab searched for ?q=', async () => {
      await renderCustomize('/customize/skills?q=terraform');

      expect(
        screen.getByRole('searchbox', { name: 'Search skills' }),
      ).toHaveValue('terraform');
      expect(
        screen.getByText('Skills panel, search “terraform”'),
      ).toBeInTheDocument();
    });

    it('reseeds the search when a link brings a new one to the tab already open', async () => {
      // The palette's "+N more" followed while Customize → Skills is open.
      function PaletteLink() {
        const navigate = useNavigate();
        return (
          <button
            type="button"
            onClick={() => navigate('/customize/skills?q=helm')}
          >
            More skills
          </button>
        );
      }
      await renderInTestApp(
        <>
          <Routes>
            <Route path="/customize/*" element={<CustomizePage />} />
          </Routes>
          <PaletteLink />
        </>,
        {
          mountedRoutes: allRoutes,
          initialRouteEntries: ['/customize/skills?q=terraform'],
        },
      );
      const field = screen.getByRole('searchbox', { name: 'Search skills' });
      await userEvent.clear(field);
      await userEvent.type(field, 'own words');

      await userEvent.click(
        screen.getByRole('button', { name: 'More skills' }),
      );

      expect(
        screen.getByRole('searchbox', { name: 'Search skills' }),
      ).toHaveValue('helm');
      expect(
        screen.getByText('Skills panel, search “helm”'),
      ).toBeInTheDocument();
    });

    it('keeps the field once a seeded search is cleared', async () => {
      await renderCustomize('/customize/models?q=opus');

      const field = screen.getByRole('searchbox', { name: 'Search models' });
      expect(field).toHaveValue('opus');
      expect(
        screen.getByText('Models panel, search “opus”'),
      ).toBeInTheDocument();

      await userEvent.clear(field);

      expect(screen.getByText('Models panel, search “”')).toBeInTheDocument();
      expect(
        screen.getByRole('searchbox', { name: 'Search models' }),
      ).toHaveValue('');
      expect(
        screen.getByRole('link', { name: 'Connect a model' }),
      ).toBeInTheDocument();
    });
  });

  it('opens the Agents tab at /customize, keeping the query string', async () => {
    await renderCustomize('/customize?installation=golem');

    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(
        '/customize/agents?installation=golem',
      ),
    );
  });

  it('sends an unknown tab to the Agents tab', async () => {
    await renderCustomize('/customize/nonsense');

    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(
        '/customize/agents',
      ),
    );
  });

  it('drops the Skills tab where no skill repository is configured', async () => {
    mockCustomizeData = { ...mockCustomizeData, hasSkillRepositories: false };
    await renderCustomize('/customize/skills');

    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(
        '/customize/agents',
      ),
    );
    expect(tabs().map(([title]) => title)).not.toContain('Skills (71)');
  });

  describe('the Workspaces tab', () => {
    it('sits last, after Workflows, where an installation in scope has the workspace-manager', async () => {
      mockCustomizeData = {
        ...mockCustomizeData,
        counts: { ...(mockCustomizeData.counts as object), workspaces: 2 },
        hasWorkspaces: true,
      };
      await renderCustomize('/customize/workspaces');

      expect(tabs().map(([title]) => title)).toEqual([
        'Agents (5)',
        'Skills (71)',
        'Connectors (7)',
        'Models (3)',
        'Workflows (2)',
        'Workspaces (2)',
      ]);
      expect(screen.getByText(/^Workspaces panel/)).toBeInTheDocument();
      // The Organization scope beside the Environment control.
      expect(screen.getByText('Organization scope')).toBeInTheDocument();
      expect(screen.getByText('Environment for muster')).toBeInTheDocument();
      // Its own create action, carrying the Organization and installation.
      expect(
        screen.getByRole('link', { name: 'New workspace' }),
      ).toBeInTheDocument();
    });

    it('is absent from the strip where no installation has the workspace-manager', async () => {
      mockCustomizeData = { ...mockCustomizeData, hasWorkspaces: false };
      await renderCustomize('/customize/agents');

      expect(tabs().some(([title]) => title?.startsWith('Workspaces'))).toBe(
        false,
      );
    });

    it('renders at its address whatever is known, its panel saying what there is', async () => {
      mockCustomizeData = { ...mockCustomizeData, hasWorkspaces: false };
      await renderCustomize('/customize/workspaces');

      expect(screen.getByText(/^Workspaces panel/)).toBeInTheDocument();
      expect(screen.getByTestId('location')).toHaveTextContent(
        '/customize/workspaces',
      );
      expect(screen.getByRole('tab', { selected: true })).toHaveTextContent(
        'Workspaces',
      );
    });

    it('stays out of the strip while it is not known yet, its address loading', async () => {
      mockCustomizeData = { ...mockCustomizeData, hasWorkspaces: undefined };
      await renderCustomize('/customize/agents');

      expect(tabs().some(([title]) => title?.startsWith('Workspaces'))).toBe(
        false,
      );
    });
  });

  describe('the Toolchains tab', () => {
    it('sits after Workspaces, with New toolchain, where an installation in scope has the toolchain-manager', async () => {
      mockCustomizeData = {
        ...mockCustomizeData,
        hasWorkspaces: true,
        hasToolchains: true,
      };
      await renderCustomize('/customize/toolchains');

      expect(tabs().map(([title]) => title?.split(' (')[0])).toEqual([
        'Agents',
        'Skills',
        'Connectors',
        'Models',
        'Workflows',
        'Workspaces',
        'Toolchains',
      ]);
      expect(screen.getByText(/^Toolchains panel/)).toBeInTheDocument();
      expect(
        screen.getByRole('link', { name: 'New toolchain' }),
      ).toBeInTheDocument();
    });

    it('is absent from the strip where no installation has the toolchain-manager', async () => {
      mockCustomizeData = { ...mockCustomizeData, hasToolchains: false };
      await renderCustomize('/customize/agents');

      expect(tabs().some(([title]) => title?.startsWith('Toolchains'))).toBe(
        false,
      );
    });
  });

  it('names itself and its tab in the document title, and follows the tab', async () => {
    // Live round 2 (R5): every tab carried the bare "Customize", so the title
    // never said which one was open. QA round 1: the app title must not be
    // appended on top of the product ("… · Agent Platform | Agent Platform").
    await renderCustomize('/customize/agents', {
      config: { app: { title: 'Agent Platform' } },
    });

    await waitFor(() => expect(document.title).toBe('Agents · Customize'));

    await userEvent.click(screen.getByRole('tab', { name: /^Workflows/ }));

    await waitFor(() => expect(document.title).toBe('Workflows · Customize'));
  });

  describe('the Connectors tab’s sub-tabs', () => {
    const subTabs = () =>
      screen
        .getAllByRole('tab')
        .filter(tab =>
          /^(Your connectors|Infrastructure|Internal)/.test(
            tab.textContent ?? '',
          ),
        )
        .map(tab => [tab.textContent, tab.getAttribute('href')]);

    it('opens on the customer’s own connectors, at the tab’s own address', async () => {
      await renderCustomize('/customize/connectors?installation=golem');

      expect(subTabs()).toEqual([
        ['Your connectors (3)', '/customize/connectors?installation=golem'],
        [
          'Infrastructure (2)',
          '/customize/connectors/infrastructure?installation=golem',
        ],
        ['Internal (2)', '/customize/connectors/internal?installation=golem'],
      ]);
      expect(
        screen.getByText('Connectors panel, search “”, yours'),
      ).toBeInTheDocument();
      expect(screen.getByTestId('location')).toHaveTextContent(
        '/customize/connectors?installation=golem',
      );
    });

    it.each([
      ['infrastructure', 'Infrastructure'],
      ['internal', 'Internal'],
    ])(
      'shows the %s sub-tab at its own path, named in the document title',
      async (path, title) => {
        await renderCustomize(`/customize/connectors/${path}`);

        expect(
          screen.getByText(`Connectors panel, search “”, ${path}`),
        ).toBeInTheDocument();
        expect(
          screen.getByRole('tab', { name: /^Connectors/ }),
        ).toHaveAttribute('aria-selected', 'true');
        await waitFor(() =>
          expect(
            screen.getByRole('tab', { name: new RegExp(`^${title}`) }),
          ).toHaveAttribute('aria-selected', 'true'),
        );
        await waitFor(() =>
          expect(document.title).toBe(`${title} · Connectors · Customize`),
        );
        // Add connector stays: what it adds lands on Your connectors.
        expect(
          screen.getByRole('link', { name: 'Add connector' }),
        ).toBeInTheDocument();
      },
    );

    it('keeps the search when switching sub-tabs', async () => {
      await renderCustomize('/customize/connectors');
      await userEvent.type(
        screen.getByRole('searchbox', { name: 'Search connectors and tools' }),
        'kube',
      );
      await userEvent.click(
        screen.getByRole('tab', { name: /^Infrastructure/ }),
      );

      expect(
        await screen.findByText(
          'Connectors panel, search “kube”, infrastructure',
        ),
      ).toBeInTheDocument();
    });

    it("hands a path deeper than a sub-tab to muster's sub-page", async () => {
      await renderCustomize(
        '/customize/connectors/infrastructure/anything?installation=golem',
      );

      expect(
        screen.getByText('Connectors sub-page at infrastructure/anything'),
      ).toBeInTheDocument();
    });

    it.each([
      // Infrastructure was "Families": an old link lands on it.
      [
        '/customize/connectors/families?installation=golem',
        '/customize/connectors/infrastructure?installation=golem',
      ],
      [
        '/customize/connectors/families/',
        '/customize/connectors/infrastructure',
      ],
    ])('sends %s to %s', async (from, to) => {
      await renderCustomize(from);

      await waitFor(() =>
        expect(screen.getByTestId('location').textContent).toBe(to),
      );
    });

    it.each([
      ['/customize/connectors/', 'Your connectors', 'yours'],
      ['/customize/connectors/internal/', 'Internal', 'internal'],
    ])(
      'shows %s, with its trailing slash, as its sub-tab',
      async (path, title, group) => {
        await renderCustomize(path);

        expect(
          await screen.findByText(`Connectors panel, search “”, ${group}`),
        ).toBeInTheDocument();
        await waitFor(() =>
          expect(
            screen.getByRole('tab', { name: new RegExp(`^${title}`) }),
          ).toHaveAttribute('aria-selected', 'true'),
        );
      },
    );

    it('draws no sub-tabs on the other tabs', async () => {
      await renderCustomize('/customize/models');
      expect(subTabs()).toEqual([]);
    });
  });
});
