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
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom';
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
  return {
    agentPlatformPlugin: {
      routes: {
        agents,
        newAgent: createSubRouteRef({ path: '/new', parent: agents }),
        skills,
        newSkill: createSubRouteRef({ path: '/new', parent: skills }),
        models,
        newModel: createSubRouteRef({ path: '/new', parent: models }),
      },
    },
    CustomizeDataProvider: ({ children }: { children: ReactNode }) => children,
    useCustomizeData: () => mockCustomizeData,
    useCanAddSkill: () => mockCanAddSkill,
    CustomizeAgentsPanel: mockPanel('Agents'),
    CustomizeSkillsPanel: mockPanel('Skills'),
    CustomizeModelsPanel: mockPanel('Models'),
    CustomizeWorkspacesPanel: mockPanel('Workspaces'),
    WorkspaceOrganizationSelect: () => <p>Organization scope</p>,
    CustomizeModelPage: () => {
      const { useParams } = jest.requireActual('react-router-dom');
      const { installation, namespace, name } = useParams();
      return <p>{`Model ${installation}/${namespace}/${name}`}</p>;
    },
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
    connectorGroupOfPath: (segment: string) =>
      ({ '': 'yours', infrastructure: 'infrastructure', internal: 'internal' })[
        segment
      ],
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
  '/agent-platform/agents': agentPlatformPlugin.routes.agents,
  '/agent-platform/skills': agentPlatformPlugin.routes.skills,
  '/agent-platform/models': agentPlatformPlugin.routes.models,
  '/agent-platform/mcp-servers': musterPlugin.routes.mcpServers,
};

function LocationProbe() {
  const { pathname, search } = useLocation();
  return <p data-testid="location">{`${pathname}${search}`}</p>;
}

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
        <Route path="/customize/*" element={<CustomizePage />} />
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

  it("routes one model's page beside the Models tab, without the tab strip", async () => {
    await renderCustomize('/customize/models/gazelle/kagent/default-model');

    expect(
      screen.getByText('Model gazelle/kagent/default-model'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('tab')).toBeNull();
    expect(screen.queryByText(/^Models panel/)).toBeNull();
  });

  it('leaves a count out until it is known', async () => {
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
  });

  it.each([
    ['agents', 'Agents', 'kagent', 'New agent', '/agent-platform/agents/new'],
    [
      'connectors',
      'Connectors',
      'muster',
      'Add connector',
      '/agent-platform/mcp-servers/new',
    ],
    [
      'models',
      'Models',
      'kagent',
      'Connect a model',
      '/agent-platform/models/new',
    ],
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
      '/agent-platform/skills/new',
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
      ).toHaveAttribute('href', '/agent-platform/models/new');
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
    it('sits between Skills and Connectors where an installation in scope has the workspace-manager', async () => {
      mockCustomizeData = {
        ...mockCustomizeData,
        counts: { ...(mockCustomizeData.counts as object), workspaces: 2 },
        hasWorkspaces: true,
      };
      await renderCustomize('/customize/workspaces');

      expect(tabs().map(([title]) => title)).toEqual([
        'Agents (5)',
        'Skills (71)',
        'Workspaces (2)',
        'Connectors (7)',
        'Models (3)',
        'Workflows (2)',
      ]);
      expect(screen.getByText(/^Workspaces panel/)).toBeInTheDocument();
      // The Organization scope beside the Environment control.
      expect(screen.getByText('Organization scope')).toBeInTheDocument();
      expect(screen.getByText('Environment for muster')).toBeInTheDocument();
      // Created in the workspace editor, not from the header.
      expect(screen.queryByRole('link', { name: /workspace/i })).toBeNull();
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

    it('sends an unknown path under Connectors to the default sub-tab', async () => {
      await renderCustomize(
        '/customize/connectors/nonsense?installation=golem',
      );

      await waitFor(() =>
        expect(screen.getByTestId('location')).toHaveTextContent(
          /^\/customize\/connectors\?installation=golem$/,
        ),
      );
    });

    it.each([
      [
        '/customize/connectors/infrastructure/anything?installation=golem',
        '/customize/connectors?installation=golem',
      ],
      // Infrastructure was "Families": an old link lands on it.
      [
        '/customize/connectors/families?installation=golem',
        '/customize/connectors/infrastructure?installation=golem',
      ],
      [
        '/customize/connectors/families/',
        '/customize/connectors/infrastructure',
      ],
      ['/customize/connectors/', '/customize/connectors'],
      ['/customize/connectors/internal/', '/customize/connectors/internal'],
    ])('sends %s to %s', async (from, to) => {
      await renderCustomize(from);

      await waitFor(() =>
        expect(screen.getByTestId('location').textContent).toBe(to),
      );
    });

    it('draws no sub-tabs on the other tabs', async () => {
      await renderCustomize('/customize/models');
      expect(subTabs()).toEqual([]);
    });
  });
});
