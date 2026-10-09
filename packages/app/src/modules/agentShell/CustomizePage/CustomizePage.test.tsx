import { renderInTestApp } from '@backstage/frontend-test-utils';
import { agentPlatformPlugin } from '@giantswarm/backstage-plugin-agent-platform';
import musterPlugin from '@giantswarm/backstage-plugin-muster';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { customizeRouteRef } from '../routes';
import { CustomizePage } from './CustomizePage';

let mockCustomizeData: Record<string, unknown>;
let mockMusterCounts: Record<string, number>;

function mockPanel(name: string) {
  return ({
    search,
    organization,
  }: {
    search: string;
    organization?: string;
  }) => (
    <p>{`${name} panel, search “${search}”${
      organization ? `, organization ${organization}` : ''
    }`}</p>
  );
}

jest.mock('@giantswarm/backstage-plugin-agent-platform', () => {
  const { createRouteRef, createSubRouteRef } = jest.requireActual(
    '@backstage/frontend-plugin-api',
  );
  const agents = createRouteRef();
  const models = createRouteRef();
  return {
    ALL_ORGANIZATIONS: 'all',
    agentPlatformPlugin: {
      routes: {
        agents,
        newAgent: createSubRouteRef({ path: '/new', parent: agents }),
        models,
        newModel: createSubRouteRef({ path: '/new', parent: models }),
      },
    },
    CustomizeDataProvider: ({ children }: { children: ReactNode }) => children,
    useCustomizeData: () => mockCustomizeData,
    CustomizeAgentsPanel: mockPanel('Agents'),
    CustomizeSkillsPanel: mockPanel('Skills'),
    CustomizeModelsPanel: mockPanel('Models'),
    EnvironmentSelect: ({ component }: { component?: string }) => (
      <p>{`Environment for ${component ?? 'everything'}`}</p>
    ),
    OrganizationSelect: ({
      organizations,
      onChange,
    }: {
      organizations: string[];
      onChange: (organization: string) => void;
    }) => (
      <div>
        {organizations.map(organization => (
          <button key={organization} onClick={() => onChange(organization)}>
            {`Organization ${organization}`}
          </button>
        ))}
      </div>
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
    CustomizeConnectorsPanel: mockPanel('Connectors'),
    CustomizeWorkflowsPanel: mockPanel('Workflows'),
  };
});

const allRoutes = {
  '/customize': customizeRouteRef,
  '/agent-platform/agents': agentPlatformPlugin.routes.agents,
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

describe('CustomizePage', () => {
  beforeEach(() => {
    mockCustomizeData = {
      counts: { agents: 5, skills: 71, models: 3 },
      hasSkillRepositories: true,
      agentOrganizations: ['engineering', 'support'],
      modelOrganizations: ['support'],
    };
    mockMusterCounts = { connectors: 7, workflows: 2 };
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
    ['models', 'Models', 'kagent', 'Add model', '/agent-platform/models/new'],
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

  it('narrows the Agents and Models tabs by organization only', async () => {
    await renderCustomize('/customize/agents');

    await userEvent.click(
      screen.getByRole('button', { name: 'Organization support' }),
    );
    expect(
      screen.getByText('Agents panel, search “”, organization support'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Organization engineering' }),
    ).toBeInTheDocument();
  });

  it('offers no organization on the Connectors tab', async () => {
    await renderCustomize('/customize/connectors');

    expect(
      screen.queryByRole('button', { name: /^Organization/ }),
    ).not.toBeInTheDocument();
  });

  it('hands the search to the panel', async () => {
    await renderCustomize('/customize/workflows');

    await userEvent.type(
      screen.getByRole('searchbox', { name: 'Search workflows' }),
      'report',
    );
    expect(
      screen.getByText('Workflows panel, search “report”'),
    ).toBeInTheDocument();
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

  it('names itself in the document title', async () => {
    await renderCustomize('/customize/agents', {
      config: { app: { title: 'Dev Portal' } },
    });

    await waitFor(() => expect(document.title).toBe('Customize | Dev Portal'));
  });
});
