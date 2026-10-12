import { renderInTestApp } from '@backstage/frontend-test-utils';
import { TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, screen, waitFor } from '@testing-library/react';
import {
  musterApiRef,
  type MusterApi,
} from '@giantswarm/backstage-plugin-muster';

import { AGENT_CREATED_STATE_KEY } from '../../hooks/useAgentCreatedHandoff';
import {
  AGENT_STATUS_POLL_INTERVAL_MS,
  FAILED_STATUS_POLL_INITIAL_MS,
  FAILED_STATUS_POLL_MAX_AGE_MS,
  FAILED_STATUS_POLL_MAX_MS,
  MAX_REVISION_WAIT_MS,
} from '../../hooks/useAgentStatus';
import { musterAgentStatusQueryKey } from '../../lib/queryKeys';
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
    summary: `Agent is ${verdict}.`,
    ...extra,
  };
}

async function render(
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  }),
) {
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
        agent: { exists: true, harness: 'kagent' },
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
  // helm-controller re-renders the Agent seconds later, so the first status
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
      agent: {
        exists: true,
        generation: 4,
        observedGeneration: 4,
        harness: 'kagent',
      },
    });

    /** The write's own revision, compiled by the Harness. */
    const afterTheWrite = status('ready', {
      agent: {
        exists: true,
        generation: 5,
        observedGeneration: 5,
        harness: 'kagent',
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
      // Agent is ready." below "Saving…" is the message this exists to
      // withhold until the write has actually landed.
      expect(screen.queryByText('Agent is ready.')).not.toBeInTheDocument();
      expect(
        screen.getByText(/waiting for its Harness to compile/),
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
          agent: {
            exists: true,
            generation: 5,
            harness: 'kagent',
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
          agent: { exists: true, harness: 'kagent' },
        }),
      );

      await render();

      expect(await screen.findByText('Ready')).toBeInTheDocument();
    });
  });

  it("shows agent-manager's reason when the agent fails", async () => {
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

  // Right after a create kagent can report the agent's own tool server as an
  // unresolved reference for a few seconds; that `failed` is not final. Every
  // other path polls as it did before the failed verdict was re-read.
  describe('re-reading the verdict', () => {
    const FAILED_TITLE = 'The agent did not become ready';
    const READY = status('ready', {
      agent: { exists: true, harness: 'kagent' },
    });

    /** When each `get_agent_status` read was made, on the fake clock. */
    let readAt: number[];

    /** Answers the reads in turn, the last one for good. */
    function answer(...answers: Array<object | Error>) {
      callTool.mockImplementation(async () => {
        readAt.push(Date.now());
        const next = answers[Math.min(readAt.length, answers.length) - 1];
        if (next instanceof Error) {
          throw next;
        }
        return next;
      });
    }

    /**
     * Moves the fake clock on, settling each read before the next timer, so a
     * read lands at the moment its timer fires. A read due at the very end may
     * not have rendered yet.
     */
    async function wait(ms: number) {
      await act(() => jest.advanceTimersByTimeAsync(ms));
    }

    /** The waits between consecutive reads. */
    const gaps = () => readAt.slice(1).map((at, i) => at - readAt[i]);

    beforeEach(() => {
      jest.useFakeTimers();
      readAt = [];
      mockLocationState = { [AGENT_CREATED_STATE_KEY]: HANDOFF };
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('re-reads a failed verdict less and less often until it turns ready, which ends the poll', async () => {
      answer(status('failed'), status('failed'), status('failed'), READY);

      await render();
      await wait(0);
      expect(screen.getByText(FAILED_TITLE)).toBeInTheDocument();

      await wait(35_000);
      expect(gaps()).toEqual([
        FAILED_STATUS_POLL_INITIAL_MS,
        2 * FAILED_STATUS_POLL_INITIAL_MS,
        4 * FAILED_STATUS_POLL_INITIAL_MS,
      ]);

      await wait(2 * FAILED_STATUS_POLL_MAX_MS);
      expect(readAt).toHaveLength(4);
      expect(screen.getByText('Ready')).toBeInTheDocument();
      expect(screen.queryByText(FAILED_TITLE)).not.toBeInTheDocument();
    });

    it('starts the backoff over after a failure that cleared and came back', async () => {
      answer(
        status('failed'),
        status('failed'),
        status('progressing'),
        status('failed'),
        READY,
      );

      await render();
      await wait(5_000 + 10_000 + 3_000 + 5_000);

      expect(gaps()).toEqual([
        FAILED_STATUS_POLL_INITIAL_MS,
        2 * FAILED_STATUS_POLL_INITIAL_MS,
        AGENT_STATUS_POLL_INTERVAL_MS,
        FAILED_STATUS_POLL_INITIAL_MS,
      ]);
    });

    it('takes a failed verdict as final after ten minutes, and no longer reads it', async () => {
      answer(status('failed'));

      await render();
      await wait(FAILED_STATUS_POLL_MAX_AGE_MS + FAILED_STATUS_POLL_MAX_MS);
      const reads = readAt.length;
      const lastRead = readAt[reads - 1] - readAt[0];
      expect(lastRead).toBeGreaterThanOrEqual(FAILED_STATUS_POLL_MAX_AGE_MS);
      expect(lastRead).toBeLessThan(
        FAILED_STATUS_POLL_MAX_AGE_MS + FAILED_STATUS_POLL_MAX_MS,
      );
      expect(Math.max(...gaps())).toBe(FAILED_STATUS_POLL_MAX_MS);

      await wait(10 * FAILED_STATUS_POLL_MAX_MS);
      expect(readAt).toHaveLength(reads);
      expect(screen.getByText(FAILED_TITLE)).toBeInTheDocument();
    });

    it('keeps a failed verdict on screen and backs off on through a read error', async () => {
      answer(
        status('failed'),
        new Error('muster: session expired'),
        status('failed'),
        READY,
      );

      await render();
      await wait(FAILED_STATUS_POLL_INITIAL_MS + 1);
      expect(readAt).toHaveLength(2);
      expect(screen.getByText(FAILED_TITLE)).toBeInTheDocument();
      expect(
        screen.queryByText(/could not read the agent's readiness/),
      ).not.toBeInTheDocument();

      // The error was one more unsuccessful read: the waits go on doubling.
      await wait(2 * FAILED_STATUS_POLL_MAX_MS);
      expect(gaps()).toEqual([
        FAILED_STATUS_POLL_INITIAL_MS,
        2 * FAILED_STATUS_POLL_INITIAL_MS,
        4 * FAILED_STATUS_POLL_INITIAL_MS,
      ]);
      expect(screen.getByText('Ready')).toBeInTheDocument();
    });

    it('stops when a failed agent is gone, without going back to waiting', async () => {
      answer(status('failed'), new Error('not_found: no agent pr-reviewer'));

      await render();
      await wait(10 * FAILED_STATUS_POLL_MAX_MS);

      expect(readAt).toHaveLength(2);
      expect(screen.queryByText('Deploying…')).not.toBeInTheDocument();
    });

    // As before the failed verdict was re-read: while the status still
    // describes the revision before an update, an error does not stop the
    // wait for the new one.
    it('keeps waiting for an update through a read error', async () => {
      mockLocationState = {
        [AGENT_CREATED_STATE_KEY]: {
          ...HANDOFF,
          action: 'updated',
          fromGeneration: 4,
        },
      };
      const atGeneration = (generation: number) =>
        status('ready', {
          agent: {
            exists: true,
            generation,
            observedGeneration: generation,
            harness: 'kagent',
          },
        });
      answer(
        atGeneration(4),
        new Error('backend_error: agent-manager restarting'),
        atGeneration(5),
      );

      await render();
      await wait(2 * FAILED_STATUS_POLL_MAX_MS);

      expect(gaps()).toEqual([
        AGENT_STATUS_POLL_INTERVAL_MS,
        AGENT_STATUS_POLL_INTERVAL_MS,
      ]);
      expect(screen.getByText('Ready')).toBeInTheDocument();
    });

    it('does not count a failure cached from before the page was opened', async () => {
      answer(status('failed'), READY);
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, staleTime: Infinity } },
      });
      queryClient.setQueryData(
        musterAgentStatusQueryKey('gazelle', 'kagent', 'pr-reviewer'),
        status('failed'),
        { updatedAt: Date.now() - 10 * 60_000 },
      );

      await render(queryClient);
      await wait(FAILED_STATUS_POLL_INITIAL_MS);

      // Read again at the first step, not at the minute the cached failure's
      // age would give it.
      expect(readAt).toHaveLength(1);
      await wait(FAILED_STATUS_POLL_INITIAL_MS);
      expect(gaps()).toEqual([FAILED_STATUS_POLL_INITIAL_MS]);
    });
  });
});
