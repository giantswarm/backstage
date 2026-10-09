import {
  createFrontendPlugin,
  FeatureFlagState,
  SubPageBlueprint,
} from '@backstage/frontend-plugin-api';
import { mockApis, renderTestApp } from '@backstage/frontend-test-utils';
import { screen, waitFor, within } from '@testing-library/react';
import { useMemo } from 'react';
import { useProvidePageHeaderActions } from '@giantswarm/backstage-plugin-ui-react';

import { AGENT_SHELL_FLAG } from './hooks/useAgentShell';
import { agentPlatformPlugin } from './plugin';

function RegistersHeaderAction() {
  const actions = useMemo(() => <button>Header action</button>, []);
  useProvidePageHeaderActions(actions);
  return <div>Models content</div>;
}

function stubSubPage(name: string, title: string) {
  return SubPageBlueprint.make({
    name,
    params: {
      path: name,
      title,
      loader: async () => <div>{title} content</div>,
    },
  });
}

const musterLikePlugin = createFrontendPlugin({
  pluginId: 'muster',
  extensions: [
    SubPageBlueprint.make({
      name: 'mcp-servers',
      attachTo: { id: 'page:agent-platform', input: 'pages' },
      params: {
        path: 'mcp-servers',
        title: 'MCP Servers',
        loader: async () => <div>MCP Servers content</div>,
      },
    }),
  ],
});

function renderPage(agentShell: FeatureFlagState, path: string) {
  return renderTestApp({
    features: [
      musterLikePlugin,
      createFrontendPlugin({
        pluginId: 'agent-platform',
        extensions: [
          agentPlatformPlugin.getExtension('page:agent-platform'),
          stubSubPage('usage', 'Usage'),
          stubSubPage('agents', 'Agents'),
          stubSubPage('sessions', 'Sessions'),
          SubPageBlueprint.make({
            name: 'models',
            params: {
              path: 'models',
              title: 'Models',
              loader: async () => <RegistersHeaderAction />,
            },
          }),
        ],
      }),
    ],
    config: { app: { extensions: ['page:agent-platform'] } },
    initialRouteEntries: [path],
    apis: [
      mockApis.featureFlags({
        initialStates: { [AGENT_SHELL_FLAG]: agentShell },
      }),
    ],
  });
}

describe('the Agent Platform page', () => {
  describe('while the agent shell flag is off', () => {
    it('renders its tabs in the row order, other plugins’ included', async () => {
      renderPage(FeatureFlagState.None, '/agent-platform/agents');

      expect(await screen.findByText('Agents content')).toBeInTheDocument();
      expect(
        screen.getByRole('heading', { level: 1, name: 'Agent Platform' }),
      ).toBeInTheDocument();
      expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual([
        'Sessions',
        'Agents',
        'Models',
        'MCP Servers',
        'Usage',
      ]);
    });

    it('lands a bare path on the first tab in row order', async () => {
      renderPage(FeatureFlagState.None, '/agent-platform');

      expect(await screen.findByText('Sessions content')).toBeInTheDocument();
    });
  });

  describe('inside the agent shell', () => {
    it('reads the flag when the page is built and drops the header and tab strip', async () => {
      renderPage(FeatureFlagState.Active, '/agent-platform/agents');

      expect(await screen.findByText('Agents content')).toBeInTheDocument();
      expect(
        screen.getAllByRole('heading', { level: 1 }).map(h => h.textContent),
      ).toEqual(['Agents']);
      expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
      expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    });

    it('heads the sessions sub-page with its description and a new-session action', async () => {
      renderPage(FeatureFlagState.Active, '/agent-platform/sessions');

      expect(await screen.findByText('Sessions content')).toBeInTheDocument();
      expect(
        screen.getByRole('heading', { level: 1, name: 'Sessions' }),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Every conversation you've had with an agent."),
      ).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'New session' })).toHaveAttribute(
        'href',
        '/',
      );
    });

    it('routes to another plugin’s sub-page', async () => {
      renderPage(FeatureFlagState.Active, '/agent-platform/mcp-servers');

      expect(
        await screen.findByText('MCP Servers content'),
      ).toBeInTheDocument();
    });

    it('lands a bare path on the first tab in row order', async () => {
      renderPage(FeatureFlagState.Active, '/agent-platform');

      expect(await screen.findByText('Sessions content')).toBeInTheDocument();
    });

    it('renders the actions a sub-page registers in its header', async () => {
      renderPage(FeatureFlagState.Active, '/agent-platform/models');

      expect(await screen.findByText('Models content')).toBeInTheDocument();
      const heading = screen.getByRole('heading', { level: 1, name: 'Models' });
      const header = heading.parentElement?.parentElement as HTMLElement;
      expect(
        within(header).getByRole('button', { name: 'Header action' }),
      ).toBeVisible();
    });

    it('names the sub-page in the document title', async () => {
      renderPage(FeatureFlagState.Active, '/agent-platform/agents');

      await waitFor(() =>
        expect(document.title).toBe('Agents · Agent Platform'),
      );
    });
  });
});
