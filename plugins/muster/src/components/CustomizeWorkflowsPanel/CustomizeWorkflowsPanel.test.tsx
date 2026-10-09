import type { ReactNode } from 'react';
import { screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { musterApiRef } from '../../apis';
import { workflowsRouteRef } from '../../routes';
import { MusterWorkflow } from '../../lib/k8s';
import { CustomizeWorkflowsPanel, runsLabel } from './CustomizeWorkflowsPanel';

jest.mock('../QueryClientProvider', () => ({
  QueryClientProvider: ({ children }: { children: ReactNode }) => children,
}));

let mockWorkflows: MusterWorkflow[] = [];
let mockAuthenticated = true;
jest.mock('../MusterInstanceProvider', () => ({
  useMusterInstance: () => ({
    installations: ['gazelle'],
    isLoadingInstallations: false,
    activeInstallation: 'gazelle',
    scope: 'gazelle',
    homeInstallation: 'gazelle',
    isSingleInstallation: true,
    activeInstallationInfo: { name: 'gazelle', requiresAuth: true },
    mcpServers: [],
    workflows: mockWorkflows,
    isLoading: false,
  }),
  useMusterSession: () => ({
    authenticated: mockAuthenticated,
    pending: false,
    connecting: false,
    connect: jest.fn(),
  }),
}));

function makeWorkflow(name: string, steps: number, description?: string) {
  return new MusterWorkflow(
    {
      apiVersion: 'muster.giantswarm.io/v1alpha1',
      kind: 'Workflow',
      metadata: { name },
      spec: {
        description,
        steps: Array.from({ length: steps }, (_, i) => ({
          id: `s${i}`,
          tool: 't',
        })),
      },
    } as never,
    'gazelle',
  );
}

const yesterday = new Date(Date.now() - 26 * 3600 * 1000).toISOString();

const api = {
  listExecutions: jest.fn(async ({ workflowName }: { workflowName: string }) =>
    workflowName === 'ticket-report'
      ? {
          executions: [
            {
              execution_id: 'e1',
              workflow_name: workflowName,
              status: 'completed' as const,
              started_at: yesterday,
              duration_ms: 10,
              step_count: 4,
            },
          ],
          total: 12,
          limit: 1,
          offset: 0,
          has_more: true,
        }
      : { executions: [], total: 0, limit: 1, offset: 0, has_more: false },
  ),
};

function renderPanel(search = '') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderInTestApp(
    <QueryClientProvider client={client}>
      <CustomizeWorkflowsPanel search={search} />
    </QueryClientProvider>,
    {
      apis: [[musterApiRef, api]],
      mountedRoutes: { '/agent-platform/workflows': workflowsRouteRef },
    },
  );
}

describe('CustomizeWorkflowsPanel', () => {
  beforeEach(() => {
    mockAuthenticated = true;
    mockWorkflows = [
      makeWorkflow('ticket-report', 4, 'Summarises the week’s tickets'),
      makeWorkflow('upgrade-check', 1),
    ];
    api.listExecutions.mockClear();
  });

  it('lists the workflows with their steps and runs, opening each', async () => {
    await renderPanel();

    const report = screen.getByRole('row', { name: /^ticket-report/ });
    expect(
      within(report).getByText('Summarises the week’s tickets'),
    ).toBeInTheDocument();
    expect(within(report).getByText('4 steps')).toBeInTheDocument();
    expect(
      await within(report).findByText('12 runs · 1 day ago'),
    ).toBeInTheDocument();
    expect(report).toHaveAttribute(
      'data-href',
      '/agent-platform/workflows/ticket-report?installation=gazelle',
    );

    const check = screen.getByRole('row', { name: /^upgrade-check/ });
    expect(within(check).getByText('1 step')).toBeInTheDocument();
    expect(await within(check).findByText('No runs yet')).toBeInTheDocument();
    expect(api.listExecutions).toHaveBeenCalledWith({
      workflowName: 'upgrade-check',
      limit: 1,
      installation: 'gazelle',
    });
  });

  it('asks for a muster session before reading runs', async () => {
    mockAuthenticated = false;
    await renderPanel();

    expect(screen.getByText('4 steps')).toBeInTheDocument();
    expect(
      screen.getByText(/Workflow runs are read through your muster session/),
    ).toBeInTheDocument();
    expect(api.listExecutions).not.toHaveBeenCalled();
  });

  it('asks for no session while one is connected', async () => {
    await renderPanel();

    expect(
      screen.queryByText(/Workflow runs are read through your muster session/),
    ).not.toBeInTheDocument();
  });

  it('searches names and descriptions', async () => {
    await renderPanel('tickets');

    expect(screen.getByText('ticket-report')).toBeInTheDocument();
    expect(screen.queryByText('upgrade-check')).not.toBeInTheDocument();
  });

  it('says when there are no workflows', async () => {
    mockWorkflows = [];
    await renderPanel();

    expect(screen.getByText('No workflows yet')).toBeInTheDocument();
  });
});

describe('runsLabel', () => {
  it('counts the runs and says when the last one started', () => {
    expect(
      runsLabel({
        executions: [],
        total: 0,
        limit: 1,
        offset: 0,
        has_more: false,
      }),
    ).toBe('No runs yet');
    expect(
      runsLabel({
        executions: null,
        total: 1,
        limit: 1,
        offset: 0,
        has_more: false,
      }),
    ).toBe('1 run');
  });
});
