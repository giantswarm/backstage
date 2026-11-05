import { createContext, useMemo, useState, type ReactNode } from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, Routes, Route, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  renderInTestApp,
  TestApiProvider,
} from '@backstage/frontend-test-utils';
import { PageHeaderActionsProvider } from '@giantswarm/backstage-plugin-ui-react';

import { musterApiRef } from '../../apis';
import { customizeExternalRouteRef, mcpServersRouteRef } from '../../routes';
import { MCPServer } from '../../lib/k8s';
import type { MusterInstance } from '../MusterInstanceProvider';
import { McpServersRouter } from '../McpServersRouter';

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

function mockInstance(
  active: string | undefined,
  isLoading = false,
): MusterInstance {
  return {
    installations: ['gazelle', 'golem'],
    isLoadingInstallations: false,
    installationInfos: [],
    activeInstallation: active,
    scope: active ?? 'all',
    homeInstallation: 'gazelle',
    isSingleInstallation: false,
    activeInstallationInfo: active
      ? { name: active, requiresAuth: true }
      : undefined,
    setActiveInstallation: jest.fn(),
    mcpServers: isLoading || !active ? [] : servers[active],
    workflows: [],
    isLoading,
    isLoadingWorkflows: isLoading,
    retry: jest.fn(),
    refreshInventory: jest.fn(),
  };
}

/** The section's stored scope, which the header's selector changes. */
const mockSectionContext = createContext({
  stored: 'gazelle',
  isLoading: false,
});

// The muster providers: pinned to the installation the address names, where
// it runs muster, else following the section's scope — as
// `MusterInstanceProvider` resolves them.
jest.mock('../MusterSubPage', () => ({
  MusterSubPage: ({
    installation,
    children,
  }: {
    installation?: string;
    children: ReactNode;
  }) => {
    const { useContext } = jest.requireActual('react');
    const { MusterInstanceContext: Context } = jest.requireActual(
      '../MusterInstanceProvider',
    );
    const { stored, isLoading } = useContext(mockSectionContext);
    const active = installation
      ? ['gazelle', 'golem'].find(name => name === installation)
      : stored;
    return (
      <Context.Provider value={mockInstance(active, isLoading)}>
        {children}
      </Context.Provider>
    );
  },
}));

/** The section around the wizard, with the header's installation selector. */
function Section({ isLoading = false }: { isLoading?: boolean }) {
  const [stored, setStored] = useState('gazelle');
  const { pathname, search } = useLocation();
  const section = useMemo(() => ({ stored, isLoading }), [stored, isLoading]);
  return (
    <mockSectionContext.Provider value={section}>
      <span>
        at {pathname}
        {search}
      </span>
      <button onClick={() => setStored('golem')}>switch to golem</button>
      <Link to="/customize/connectors/new">new registration</Link>
      <Link to="/customize/connectors/gazelle/miro/edit">edit miro</Link>
      <Routes>
        {/* The list is the Customize screen's Connectors tab. */}
        <Route path="/customize/connectors" element={<div>servers-list</div>} />
        <Route path="/customize/connectors/*" element={<McpServersRouter />} />
      </Routes>
    </mockSectionContext.Provider>
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
        '/customize/connectors': mcpServersRouteRef,
        '/customize': customizeExternalRouteRef,
      },
    },
  );
}

describe('NewMcpServerEditGate', () => {
  it('seeds the wizard from the edit address', async () => {
    await renderSection('/customize/connectors/gazelle/miro/edit');

    expect(
      await screen.findByRole('heading', { name: 'Edit connector' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/^Server address/)).toHaveValue(
      'https://mcp.miro.com/',
    );
  });

  it('edits the server on the installation the address names, through every step', async () => {
    // gazelle is the stored scope and has a miro too; the address names golem's.
    await renderSection('/customize/connectors/golem/miro/edit');

    expect(
      await screen.findByRole('heading', { name: 'Edit connector' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/^Server address/)).toHaveValue(
      'https://golem.miro.com/',
    );

    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(
      await screen.findByText('at /customize/connectors/golem/miro/edit/auth'),
    ).toBeInTheDocument();
    expect(screen.queryByText('servers-list')).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Edit connector' }),
    ).toBeInTheDocument();
  });

  it('says so when the address names an installation the section cannot show', async () => {
    await renderSection('/customize/connectors/offline/miro/edit');

    expect(
      await screen.findByText('Environment not available'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Connector not found')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Server address/)).not.toBeInTheDocument();
  });

  it('says so when there is no such connector', async () => {
    await renderSection('/customize/connectors/gazelle/nope/edit');

    expect(await screen.findByText('Connector not found')).toBeInTheDocument();
  });

  it('never opens the wizard for a GitOps-managed server, even by link', async () => {
    await renderSection('/customize/connectors/gazelle/github/edit');

    expect(
      await screen.findByText('This connector is managed in Git'),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Server address/)).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Back to connectors' }),
    ).toHaveAttribute('href', '/customize/connectors');
  });

  it('waits for the server list before deciding', async () => {
    await renderSection('/customize/connectors/gazelle/miro/edit', true);

    expect(await screen.findByRole('progressbar')).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Server address/)).not.toBeInTheDocument();
    expect(screen.queryByText('Connector not found')).not.toBeInTheDocument();
  });

  it('keeps editing the addressed server when the header switches installation', async () => {
    await renderSection('/customize/connectors/gazelle/miro/edit');
    await screen.findByRole('heading', { name: 'Edit connector' });

    await userEvent.click(
      screen.getByRole('button', { name: 'switch to golem' }),
    );

    // The address names gazelle's miro: the section's scope does not move it.
    expect(screen.getByLabelText(/^Server address/)).toHaveValue(
      'https://mcp.miro.com/',
    );
    expect(
      screen.getByText('at /customize/connectors/gazelle/miro/edit'),
    ).toBeInTheDocument();
  });

  it('brings a draft back once the edit is left', async () => {
    await renderSection('/customize/connectors/new');
    await userEvent.type(
      screen.getByLabelText(/^Server address/),
      'https://draft.example.com/mcp',
    );

    await userEvent.click(screen.getByRole('link', { name: 'edit miro' }));
    expect(
      await screen.findByRole('heading', { name: 'Edit connector' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/^Server address/)).toHaveValue(
      'https://mcp.miro.com/',
    );

    // A registration address is a registration again: the edit ends and the
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
