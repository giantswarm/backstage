import { screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { MusterApi, musterApiRef } from '../../../apis';
import { MCPServer, MCPServerState } from '../../../lib/k8s';
import { MusterSummary } from './MusterSummary';

let endpoint: string | undefined;
let authenticated = true;

jest.mock('../../MusterInstanceProvider', () => ({
  useMusterInstance: () => ({
    activeInstallation: 'gazelle',
    activeInstallationInfo: { name: 'gazelle', endpoint, requiresAuth: true },
  }),
  useMusterSession: () => ({
    authenticated,
    pending: false,
    connecting: false,
    connect: jest.fn(),
  }),
  isUnreachableSession: () => false,
}));

function server(name: string, state: MCPServerState): MCPServer {
  return new MCPServer(
    {
      apiVersion: 'muster.giantswarm.io/v1alpha1',
      kind: 'MCPServer',
      metadata: { name },
      spec: { type: 'streamable-http' },
      status: { state },
    } as never,
    'gazelle',
  );
}

async function renderSummary(servers: MCPServer[]) {
  const api = {
    filterTools: jest.fn(async () => ({ tools: [], total: 42 })),
  } as unknown as MusterApi;
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await renderInTestApp(
    <TestApiProvider apis={[[musterApiRef, api]]}>
      <QueryClientProvider client={queryClient}>
        <MusterSummary servers={servers} />
      </QueryClientProvider>
    </TestApiProvider>,
  );
}

/** The totals line's full text; its healthy count is a nested span. */
function totalsLine(): string {
  const count = screen.getByText(/healthy$/);
  return count.parentElement?.textContent ?? '';
}

describe('MusterSummary', () => {
  beforeEach(() => {
    endpoint = 'https://muster.gazelle.example.com/mcp';
    authenticated = true;
  });

  it('shows the endpoint with a copy button, and the totals', async () => {
    await renderSummary([
      server('a', 'Connected'),
      server('b', 'Auth Required'),
      server('c', 'Failed'),
    ]);

    expect(
      screen.getByText('https://muster.gazelle.example.com/mcp'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Copy endpoint' }),
    ).toBeInTheDocument();
    expect(screen.getByText('2 healthy')).toBeInTheDocument();
    expect(await screen.findByText(/42 tools/)).toBeInTheDocument();
    expect(totalsLine()).toBe('3 servers · 2 healthy · 42 tools');
  });

  it('leaves the tool total out without a muster session', async () => {
    authenticated = false;
    await renderSummary([server('a', 'Connected')]);

    expect(totalsLine()).toBe('1 server · 1 healthy');
  });

  it('says so when the installation has no endpoint configured', async () => {
    endpoint = undefined;
    await renderSummary([]);

    expect(screen.getByText('not configured for gazelle')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copy endpoint' })).toBeNull();
  });
});
