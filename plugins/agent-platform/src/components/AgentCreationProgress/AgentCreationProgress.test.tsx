import { renderInTestApp } from '@backstage/frontend-test-utils';
import { TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen, waitFor } from '@testing-library/react';
import { musterApiRef, type MusterApi } from '@giantswarm/backstage-plugin-muster';

import { AGENT_CREATED_STATE_KEY } from '../../hooks/useAgentCreatedHandoff';
import { AgentCreationProgress } from './AgentCreationProgress';

let mockLocationState: unknown;
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useLocation: () => ({
    pathname: '/agent-platform/agents/gazelle/kagent/pr-reviewer',
    search: '',
    state: mockLocationState,
  }),
  useNavigate: () => mockNavigate,
}));

const callTool = jest.fn();
const musterApi = { callTool } as unknown as MusterApi;

const HANDOFF = {
  installation: 'gazelle',
  namespace: 'kagent',
  name: 'pr-reviewer',
  requestedBy: 'admin@lab.local',
};

function status(verdict: string, extra: Record<string, unknown> = {}) {
  return {
    name: 'pr-reviewer',
    namespace: 'kagent',
    verdict,
    summary: `The template is ${verdict}.`,
    ...extra,
  };
}

async function render() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderInTestApp(
    <TestApiProvider apis={[[musterApiRef, musterApi]]}>
      <QueryClientProvider client={queryClient}>
        <div data-testid="host">
          <AgentCreationProgress
            installation="gazelle"
            namespace="kagent"
            name="pr-reviewer"
          />
        </div>
      </QueryClientProvider>
    </TestApiProvider>,
  );
}

beforeEach(() => {
  callTool.mockReset();
  mockNavigate.mockReset();
  mockLocationState = undefined;
});

describe('AgentCreationProgress', () => {
  it('renders nothing, and reads nothing, without a create to follow', async () => {
    await render();
    expect(screen.getByTestId('host')).toBeEmptyDOMElement();
    expect(callTool).not.toHaveBeenCalled();
  });

  it('renders nothing for another agent than the one created', async () => {
    mockLocationState = {
      [AGENT_CREATED_STATE_KEY]: { ...HANDOFF, name: 'someone-else' },
    };
    await render();
    expect(screen.getByTestId('host')).toBeEmptyDOMElement();
    expect(callTool).not.toHaveBeenCalled();
  });

  it('polls get_agent_status until the platform Harness reports ready, then names the Harness', async () => {
    mockLocationState = { [AGENT_CREATED_STATE_KEY]: HANDOFF };
    callTool
      .mockResolvedValueOnce(status('progressing'))
      .mockResolvedValue(
        status('ready', {
          template: { exists: true, harnesses: [{ harness: 'kagent' }] },
        }),
      );

    await render();

    expect(await screen.findByText('Deploying…')).toBeInTheDocument();
    expect(callTool).toHaveBeenCalledWith(
      'x_agent-manager_get_agent_status',
      { namespace: 'kagent', name: 'pr-reviewer' },
      'gazelle',
    );
    // The router state is consumed once so a Back navigation does not replay it.
    expect(mockNavigate).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/agent-platform/agents/gazelle/kagent/pr-reviewer',
      }),
      expect.objectContaining({ replace: true }),
    );

    await waitFor(
      () => expect(screen.getByText('Ready')).toBeInTheDocument(),
      { timeout: 6_000 },
    );
    expect(
      screen.getByText(
        'The agent is ready on Harness kagent (created as admin@lab.local).',
      ),
    ).toBeInTheDocument();
  }, 10_000);

  it("shows agent-manager's reason when the template fails", async () => {
    mockLocationState = { [AGENT_CREATED_STATE_KEY]: HANDOFF };
    callTool.mockResolvedValue({
      ...status('failed'),
      summary:
        'Harness kagent rejected the template: Compatible=False (skill source unreachable).',
    });

    await render();

    expect(
      await screen.findByText('The agent did not become ready'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Harness kagent rejected the template/),
    ).toBeInTheDocument();
  });
});
