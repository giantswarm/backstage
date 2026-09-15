import { renderInTestApp } from '@backstage/frontend-test-utils';
import { TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, screen, waitFor } from '@testing-library/react';
import {
  musterApiRef,
  type MusterApi,
} from '@giantswarm/backstage-plugin-muster';

import { AGENT_CREATED_STATE_KEY } from '../../hooks/useAgentCreatedHandoff';
import { MAX_REVISION_WAIT_MS } from '../../hooks/useAgentStatus';
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
    callTool.mockResolvedValueOnce(status('progressing')).mockResolvedValue(
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

    await waitFor(() => expect(screen.getByText('Ready')).toBeInTheDocument(), {
      timeout: 6_000,
    });
    expect(
      screen.getByText(
        'The agent is ready on Harness kagent (created as admin@lab.local).',
      ),
    ).toBeInTheDocument();
  }, 10_000);

  // The defect this guards: agent-manager writes the HelmRelease and returns,
  // helm-controller re-renders the template seconds later, so the first status
  // read after saving an agent that was already `ready` answers `ready` — for
  // the revision before the write. Reported as success, that is a green alert
  // for something the Harness has not compiled.
  describe('a write on an agent that was already ready', () => {
    const UPDATED = {
      ...HANDOFF,
      action: 'updated',
      fromGeneration: 4,
    };

    /** The pre-write revision: settled, and at the generation of the baseline. */
    const beforeTheWrite = status('ready', {
      template: {
        exists: true,
        generation: 4,
        observedGeneration: 4,
        harnesses: [{ harness: 'kagent' }],
      },
    });

    /** The write's own revision, compiled by the Harness. */
    const afterTheWrite = status('ready', {
      template: {
        exists: true,
        generation: 5,
        observedGeneration: 5,
        harnesses: [{ harness: 'kagent' }],
      },
    });

    it('keeps waiting while the status still describes the revision before it', async () => {
      mockLocationState = { [AGENT_CREATED_STATE_KEY]: UPDATED };
      callTool.mockResolvedValue(beforeTheWrite);

      await render();

      // The status has been read — the generic waiting description is how we
      // know this frame is not the initial loading one, which carries the same
      // text; what matters is that the alert is still the waiting one, because
      // that `ready` verdict belongs to generation 4, the one the write started
      // from.
      expect(await screen.findByText('Saving…')).toBeInTheDocument();
      await waitFor(() => expect(callTool).toHaveBeenCalled());
      expect(screen.queryByText('Ready')).not.toBeInTheDocument();
      // And the pre-write revision's own summary is not put under it: "The
      // template is ready." below "Saving…" is the message this exists to
      // withhold until the write has actually landed.
      expect(
        screen.queryByText('The template is ready.'),
      ).not.toBeInTheDocument();
      expect(
        screen.getByText(/waiting for the platform Harness to compile/),
      ).toBeInTheDocument();
    });

    it('reports the write once the new generation is compiled', async () => {
      mockLocationState = { [AGENT_CREATED_STATE_KEY]: UPDATED };
      callTool
        .mockResolvedValueOnce(beforeTheWrite)
        .mockResolvedValue(afterTheWrite);

      await render();

      await waitFor(
        () => expect(screen.getByText('Ready')).toBeInTheDocument(),
        { timeout: 6_000 },
      );
      expect(
        screen.getByText(/\(saved as admin@lab\.local\)/),
      ).toBeInTheDocument();
      // It took a second read to get there: the first answered for the old
      // revision, and settling on that is the bug.
      expect(callTool.mock.calls.length).toBeGreaterThan(1);
    }, 10_000);

    // Not every installation sets `observedGeneration`, the same caveat the
    // Agent readiness derivation makes; a generation past the baseline is then
    // the whole signal.
    it('takes a bumped generation alone when observedGeneration is absent', async () => {
      mockLocationState = { [AGENT_CREATED_STATE_KEY]: UPDATED };
      callTool.mockResolvedValue(
        status('ready', {
          template: {
            exists: true,
            generation: 5,
            harnesses: [{ harness: 'kagent' }],
          },
        }),
      );

      await render();

      expect(await screen.findByText('Ready')).toBeInTheDocument();
    });

    // The bound exists for a write whose generation never moves — a release
    // that cannot be reconciled, or an update that changes nothing the chart
    // renders.
    //
    // This pins the behaviour (and is sensitive to the deadline: advancing a
    // quarter of it leaves the waiting alert up), not the mechanism. jsdom
    // re-renders this component on polls that the browser would not — an
    // unchanged status is structurally shared, so `data` keeps its reference
    // and the tracked-prop observer notifies nobody — which is why the deadline
    // schedules its own render rather than being a `Date.now()` read evaluated
    // whenever a render happens to occur.
    it('gives up waiting after the deadline and shows the verdict it has', async () => {
      jest.useFakeTimers();
      try {
        mockLocationState = { [AGENT_CREATED_STATE_KEY]: UPDATED };
        callTool.mockResolvedValue(beforeTheWrite);

        await render();
        await waitFor(() => expect(callTool).toHaveBeenCalled());
        expect(screen.getByText('Saving…')).toBeInTheDocument();

        // Nothing changes about the status; only the deadline passes.
        await act(async () => {
          jest.advanceTimersByTime(MAX_REVISION_WAIT_MS);
        });

        expect(screen.getByText('Ready')).toBeInTheDocument();
        expect(screen.queryByText('Saving…')).not.toBeInTheDocument();
      } finally {
        jest.useRealTimers();
      }
    });

    // A create has no earlier generation to compare against, so the verdict
    // stands on its own — as it always did.
    it('does not wait for a generation the create flow cannot have', async () => {
      mockLocationState = { [AGENT_CREATED_STATE_KEY]: HANDOFF };
      callTool.mockResolvedValue(
        status('ready', {
          template: { exists: true, harnesses: [{ harness: 'kagent' }] },
        }),
      );

      await render();

      expect(await screen.findByText('Ready')).toBeInTheDocument();
    });
  });

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
