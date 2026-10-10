import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { musterApiRef } from '../../apis';
import type {
  ListExecutionsOptions,
  WorkflowExecutionStep,
  WorkflowExecutionSummary,
} from '../../apis/types';
import { WorkflowRunsSection } from './WorkflowRunsSection';

/** `count` recorded runs, newest first; `run-0` is the newest. */
function makeRuns(count: number): WorkflowExecutionSummary[] {
  return Array.from({ length: count }, (_, i) => ({
    execution_id: `run-${i}`,
    workflow_name: 'deploy',
    status: i === 0 ? ('failed' as const) : ('completed' as const),
    started_at: new Date(Date.UTC(2026, 9, 9, 8) - i * 60_000).toISOString(),
    duration_ms: 1000,
    step_count: i === 0 ? 300 : 3,
  }));
}

/** A run's step records: `count` iterations of one loop step. */
function makeSteps(count: number, failedAt?: number): WorkflowExecutionStep[] {
  return Array.from({ length: count }, (_, i) => ({
    step_id: `probe-${i + 1}`,
    tool: 'core_service_list',
    status: i + 1 === failedAt ? ('failed' as const) : ('completed' as const),
    started_at: '2026-10-09T08:00:00Z',
    duration_ms: 0,
    ...(i + 1 === failedAt ? { error: 'probe refused' } : {}),
  }));
}

function makeApi(recorded: number, steps: WorkflowExecutionStep[] = []) {
  const all = makeRuns(recorded);
  return {
    listExecutions: jest.fn(async (options: ListExecutionsOptions) => {
      const offset = options.offset ?? 0;
      const limit = options.limit ?? 50;
      return {
        executions: all.slice(offset, offset + limit),
        total: all.length,
        limit,
        offset,
        has_more: offset + limit < all.length,
      };
    }),
    getExecution: jest.fn(async (id: string) => ({
      ...all.find(run => run.execution_id === id)!,
      steps,
    })),
  };
}

async function renderSection(api: ReturnType<typeof makeApi>) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await renderInTestApp(
    <QueryClientProvider client={queryClient}>
      <WorkflowRunsSection
        name="deploy"
        installation="gazelle"
        hasSession
        prefixes={[]}
      />
    </QueryClientProvider>,
    { apis: [[musterApiRef, api as never]] },
  );
}

const runRows = () => screen.queryAllByText(/^(Succeeded|Failed)$/);
const traceRows = () => screen.queryAllByText(/^probe-\d+$/);

describe('WorkflowRunsSection', () => {
  describe('recent runs', () => {
    it('lists three runs whole, with no older-runs control and no tally', async () => {
      const api = makeApi(3);
      await renderSection(api);

      await waitFor(() => expect(runRows()).toHaveLength(3));
      expect(screen.queryByRole('button', { name: /older run/ })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Show fewer' })).toBeNull();
      expect(screen.queryByText(/The newest/)).toBeNull();
      expect(screen.queryByRole('searchbox')).toBeNull();
      expect(api.listExecutions).toHaveBeenCalledTimes(1);
    });

    it('lists the newest 5 of 300 and reads older runs 20 at a time via offset', async () => {
      const api = makeApi(300);
      await renderSection(api);

      await waitFor(() => expect(runRows()).toHaveLength(5));
      expect(
        screen.getByText(/The newest 5 of 300 recorded runs\./),
      ).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Show fewer' })).toBeNull();

      await userEvent.click(
        screen.getByRole('button', { name: 'Show 20 older runs' }),
      );
      await waitFor(() => expect(runRows()).toHaveLength(25));
      expect(api.listExecutions).toHaveBeenCalledWith(
        expect.objectContaining({
          workflowName: 'deploy',
          limit: 20,
          offset: 5,
          installation: 'gazelle',
        }),
      );
      expect(
        screen.getByText(/The newest 25 of 300 recorded runs\./),
      ).toBeInTheDocument();

      await userEvent.click(
        await screen.findByRole('button', { name: 'Show 20 older runs' }),
      );
      await waitFor(() => expect(runRows()).toHaveLength(45));
      expect(api.listExecutions).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 20, offset: 25 }),
      );

      // Show fewer goes back to the newest page.
      await userEvent.click(screen.getByRole('button', { name: 'Show fewer' }));
      expect(runRows()).toHaveLength(5);
      expect(
        screen.getByRole('button', { name: 'Show 20 older runs' }),
      ).toBeInTheDocument();
    });

    it('stops offering older runs once all are listed', async () => {
      const api = makeApi(12);
      await renderSection(api);

      await userEvent.click(
        await screen.findByRole('button', { name: 'Show 7 older runs' }),
      );
      await waitFor(() => expect(runRows()).toHaveLength(12));
      expect(screen.queryByRole('button', { name: /older run/ })).toBeNull();
      expect(screen.queryByText(/The newest/)).toBeNull();
      expect(screen.getByRole('button', { name: 'Show fewer' })).toBeTruthy();
    });
  });

  describe('run trace', () => {
    it('shows a three-step trace whole, with no reveal control', async () => {
      await renderSection(makeApi(1, makeSteps(3, 2)));

      await userEvent.click(await screen.findByText('Failed'));
      await waitFor(() => expect(traceRows()).toHaveLength(3));
      expect(
        screen.getByText('Failed at step 2 (probe-2): probe refused'),
      ).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Show \d+/ })).toBeNull();
      expect(screen.queryByText(/steps? shown/)).toBeNull();
      expect(screen.queryByText(/not shown before/)).toBeNull();
      expect(screen.queryByRole('searchbox')).toBeNull();
    });

    it('renders the first 20 of 300 step records and keeps the failed step in view', async () => {
      await renderSection(makeApi(1, makeSteps(300, 250)));

      await userEvent.click(await screen.findByText('Failed'));
      await waitFor(() => expect(traceRows().length).toBeGreaterThan(0));
      // The first page plus the pinned failed step, nothing in between.
      expect(traceRows().map(row => row.textContent)).toEqual([
        ...Array.from({ length: 20 }, (_, i) => `probe-${i + 1}`),
        'probe-250',
      ]);
      expect(
        screen.getByText('… 229 steps not shown before the failed step 250'),
      ).toBeInTheDocument();
      expect(screen.getByText('20 steps shown, 280 more')).toBeInTheDocument();

      await userEvent.click(
        screen.getByRole('button', { name: 'Show 20 more steps' }),
      );
      expect(traceRows()).toHaveLength(41);
      expect(
        screen.getByText('… 209 steps not shown before the failed step 250'),
      ).toBeInTheDocument();
    });

    it('pins nothing extra when the failed step is already on the first page', async () => {
      await renderSection(makeApi(1, makeSteps(300, 4)));

      await userEvent.click(await screen.findByText('Failed'));
      await waitFor(() => expect(traceRows()).toHaveLength(20));
      expect(screen.queryByText(/not shown before/)).toBeNull();
    });
  });
});
