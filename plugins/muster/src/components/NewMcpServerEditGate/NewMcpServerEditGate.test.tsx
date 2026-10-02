import { useState } from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, Routes, Route } from 'react-router-dom';
import { renderInTestApp } from '@backstage/frontend-test-utils';

import { mcpServersRouteRef } from '../../routes';
import { MCPServer } from '../../lib/k8s';
import {
  MusterInstance,
  MusterInstanceContext,
} from '../MusterInstanceProvider';
import { McpServersRouter } from '../McpServersRouter';
import { withEditParam } from './NewMcpServerEditGate';

jest.mock('../McpServersPage', () => ({
  McpServersPage: () => <div>servers-list</div>,
}));

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
      <Link to="/agent-platform/mcp-servers/new">new registration</Link>
      <Link to="/agent-platform/mcp-servers/new?edit=miro">edit miro</Link>
      <Routes>
        <Route
          path="/agent-platform/mcp-servers/*"
          element={<McpServersRouter />}
        />
      </Routes>
    </MusterInstanceContext.Provider>
  );
}

function renderSection(path: string, isLoading?: boolean) {
  return renderInTestApp(<Section isLoading={isLoading} />, {
    initialRouteEntries: [path],
    mountedRoutes: { '/agent-platform/mcp-servers': mcpServersRouteRef },
  });
}

describe('NewMcpServerEditGate', () => {
  it('seeds the wizard from ?edit on the active installation', async () => {
    await renderSection('/agent-platform/mcp-servers/new?edit=miro');

    expect(
      await screen.findByText('Edit MCP server: miro'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/^URL/)).toHaveValue('https://mcp.miro.com/');
  });

  it('never opens the wizard for a GitOps-managed server, even by link', async () => {
    await renderSection('/agent-platform/mcp-servers/new?edit=github');

    expect(
      await screen.findByText('This server is managed in Git'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Step 1 of 4: Details')).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Back to MCP servers' }),
    ).toBeInTheDocument();
  });

  it('waits for the server list before deciding', async () => {
    await renderSection('/agent-platform/mcp-servers/new?edit=miro', true);

    expect(await screen.findByRole('progressbar')).toBeInTheDocument();
    expect(screen.queryByText('Step 1 of 4: Details')).not.toBeInTheDocument();
    expect(screen.queryByText('Server not found')).not.toBeInTheDocument();
  });

  it('ends the edit when the header switches installation', async () => {
    await renderSection('/agent-platform/mcp-servers/new?edit=miro');
    await screen.findByText('Edit MCP server: miro');

    await userEvent.click(
      screen.getByRole('button', { name: 'switch to golem' }),
    );

    // Back on the list — not quietly editing golem's server of the same name.
    expect(await screen.findByText('servers-list')).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('link', { name: 'new registration' }),
    );
    expect(
      await screen.findByText('Register an MCP server'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/^URL/)).toHaveValue('');
  });

  it('brings a draft back once the edit is left', async () => {
    await renderSection('/agent-platform/mcp-servers/new');
    await userEvent.type(
      screen.getByLabelText(/^URL/),
      'https://draft.example.com/mcp',
    );

    await userEvent.click(screen.getByRole('link', { name: 'edit miro' }));
    expect(screen.getByLabelText(/^URL/)).toHaveValue('https://mcp.miro.com/');

    // A /new without ?edit is a registration again: the edit ends and the
    // draft it set aside is back.
    await userEvent.click(
      screen.getByRole('link', { name: 'new registration' }),
    );
    expect(
      await screen.findByText('Register an MCP server'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/^URL/)).toHaveValue(
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
});
