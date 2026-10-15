import { useState } from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  renderInTestApp,
  TestApiProvider,
} from '@backstage/frontend-test-utils';
import { PageHeaderActionsProvider } from '@giantswarm/backstage-plugin-ui-react';

import { musterApiRef } from '../../apis';
import { customizeExternalRouteRef, mcpServersRouteRef } from '../../routes';
import { MCPServer } from '../../lib/k8s';
import {
  MusterInstance,
  MusterInstanceContext,
} from '../MusterInstanceProvider';
import { McpServersRouter } from '../McpServersRouter';
import { withEditParam } from './NewMcpServerEditGate';

jest.mock('../NewMcpServerPage/useTransportDetection', () => ({
  useTransportDetection: () => ({ detected: undefined, probing: false }),
}));

function server(name: string, cluster: string, url: string): MCPServer {
  return new MCPServer(
    {
      apiVersion: 'muster.giantswarm.io/v1alpha1',
      kind: 'MCPServer',
      metadata: { name },
      spec: { type: 'streamable-http', url },
    } as never,
    cluster,
  );
}

/** An MCPServer rendered by a HelmRelease: Git owns it. */
const managed = new MCPServer(
  {
    apiVersion: 'muster.giantswarm.io/v1alpha1',
    kind: 'MCPServer',
    metadata: {
      name: 'github',
      labels: { 'app.kubernetes.io/managed-by': 'Helm' },
    },
    spec: { type: 'streamable-http', url: 'https://github.example.com/mcp' },
  } as never,
  'gazelle',
);

const servers: Record<string, MCPServer[]> = {
  gazelle: [server('miro', 'gazelle', 'https://mcp.miro.com/'), managed],
  golem: [server('miro', 'golem', 'https://golem.miro.com/')],
};

function instance(active: string, isLoading = false): MusterInstance {
  return {
    installations: ['gazelle', 'golem'],
    isLoadingInstallations: false,
    installationInfos: [],
    activeInstallation: active,
    scope: active,
    homeInstallation: 'gazelle',
    isSingleInstallation: false,
    activeInstallationInfo: { name: active, requiresAuth: true },
    setActiveInstallation: jest.fn(),
    mcpServers: isLoading ? [] : servers[active],
    workflows: [],
    isLoading,
    isLoadingWorkflows: isLoading,
    retry: jest.fn(),
    refreshInventory: jest.fn(),
  };
}

/** The section around the wizard, with the header's installation selector. */
function Section({ isLoading }: { isLoading?: boolean }) {
  const [active, setActive] = useState('gazelle');
  return (
    <MusterInstanceContext.Provider value={instance(active, isLoading)}>
      <button onClick={() => setActive('golem')}>switch to golem</button>
      <Link to="/agent-platform/connectors/new">new registration</Link>
      <Link to="/agent-platform/connectors/new?edit=miro">edit miro</Link>
      <Routes>
        <Route
          path="/agent-platform/connectors/*"
          element={<McpServersRouter />}
        />
        {/* The list is the Customize screen's Connectors tab. */}
        <Route path="/customize/*" element={<div>servers-list</div>} />
      </Routes>
    </MusterInstanceContext.Provider>
  );
}

function renderSection(path: string, isLoading?: boolean) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderInTestApp(
    <TestApiProvider apis={[[musterApiRef, { callTool: jest.fn() } as never]]}>
      <QueryClientProvider client={queryClient}>
        <PageHeaderActionsProvider>
          <Section isLoading={isLoading} />
        </PageHeaderActionsProvider>
      </QueryClientProvider>
    </TestApiProvider>,
    {
      initialRouteEntries: [path],
      mountedRoutes: {
        '/agent-platform/connectors': mcpServersRouteRef,
        '/customize': customizeExternalRouteRef,
      },
    },
  );
}

describe('NewMcpServerEditGate', () => {
  it('seeds the wizard from ?edit on the active installation', async () => {
    await renderSection('/agent-platform/connectors/new?edit=miro');

    expect(
      await screen.findByRole('heading', { name: 'Edit connector' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/^Server address/)).toHaveValue(
      'https://mcp.miro.com/',
    );
  });

  it('seeds the wizard from the installation the link names', async () => {
    await renderSection(
      '/agent-platform/connectors/new?edit=miro&installation=gazelle',
    );

    expect(
      await screen.findByRole('heading', { name: 'Edit connector' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/^Server address/)).toHaveValue(
      'https://mcp.miro.com/',
    );
  });

  it('reads the installation from the link before the active one', async () => {
    await renderSection(
      '/agent-platform/connectors/new?edit=miro&installation=golem',
    );

    // gazelle is active and has a miro too; the link names golem's.
    expect(
      await screen.findByText('There is no connector "miro" on golem.'),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Server address/)).not.toBeInTheDocument();
  });

  it('never opens the wizard for a GitOps-managed server, even by link', async () => {
    await renderSection('/agent-platform/connectors/new?edit=github');

    expect(
      await screen.findByText('This connector is managed in Git'),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Server address/)).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Back to connectors' }),
    ).toBeInTheDocument();
  });

  it('waits for the server list before deciding', async () => {
    await renderSection('/agent-platform/connectors/new?edit=miro', true);

    expect(await screen.findByRole('progressbar')).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Server address/)).not.toBeInTheDocument();
    expect(screen.queryByText('Connector not found')).not.toBeInTheDocument();
  });

  it('ends the edit when the header switches installation', async () => {
    await renderSection('/agent-platform/connectors/new?edit=miro');
    await screen.findByRole('heading', { name: 'Edit connector' });

    await userEvent.click(
      screen.getByRole('button', { name: 'switch to golem' }),
    );

    // Back on the list — not quietly editing golem's server of the same name.
    expect(await screen.findByText('servers-list')).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('link', { name: 'new registration' }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Add connector' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/^Server address/)).toHaveValue('');
  });

  it('brings a draft back once the edit is left', async () => {
    await renderSection('/agent-platform/connectors/new');
    await userEvent.type(
      screen.getByLabelText(/^Server address/),
      'https://draft.example.com/mcp',
    );

    await userEvent.click(screen.getByRole('link', { name: 'edit miro' }));
    expect(screen.getByLabelText(/^Server address/)).toHaveValue(
      'https://mcp.miro.com/',
    );

    // A /new without ?edit is a registration again: the edit ends and the
    // draft it set aside is back.
    await userEvent.click(
      screen.getByRole('link', { name: 'new registration' }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Add connector' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/^Server address/)).toHaveValue(
      'https://draft.example.com/mcp',
    );
  });
});

describe('withEditParam', () => {
  it('adds the edited server to a step path', () => {
    expect(withEditParam('/servers/new/auth', 'my server')).toBe(
      '/servers/new/auth?edit=my%20server',
    );
    expect(withEditParam('/servers/new', undefined)).toBe('/servers/new');
  });

  it('names the installation on the link that starts an edit', () => {
    expect(withEditParam('/servers/new', 'my server', 'gazelle')).toBe(
      '/servers/new?edit=my%20server&installation=gazelle',
    );
  });
});
