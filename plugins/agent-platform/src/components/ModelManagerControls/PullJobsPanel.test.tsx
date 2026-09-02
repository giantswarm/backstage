import { PropsWithChildren } from 'react';
import {
  renderInTestApp,
  TestApiProvider,
} from '@backstage/frontend-test-utils';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { modelManagerApiRef } from '../../apis';
import type { ModelManagerApi } from '../../apis/ModelManagerApi';
import jobsFixture from '../../lib/__fixtures__/model-manager.jobs.json';
import {
  modelManagerJobSchema,
  parseModelManagerList,
} from '../../lib/modelManager';
import { modelsRouteRef } from '../../routes';
import {
  formatJobProgress,
  PullJobsPanel,
  type ModelConfigExists,
} from './PullJobsPanel';

const listJobs = jest.fn();
const cancelJob = jest.fn();
const modelManagerApi = { listJobs, cancelJob } as unknown as ModelManagerApi;

const finished = parseModelManagerList(
  jobsFixture,
  'jobs',
  modelManagerJobSchema,
);
const running = {
  ...finished[0],
  id: 'running-1',
  model: 'qwen2.5:1.5b',
  phase: 'running' as const,
  status: 'pulling 6f7f…',
  bytesCompleted: 120_000_000,
  bytesTotal: 400_000_000,
  percent: 30,
  result: undefined,
  createdAt: '2026-09-02T13:00:00Z',
};

function render(
  installations = ['lab'],
  modelConfigExists?: ModelConfigExists,
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const Wrapper = ({ children }: PropsWithChildren<{}>) => (
    <TestApiProvider apis={[[modelManagerApiRef, modelManagerApi]]}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </TestApiProvider>
  );
  return renderInTestApp(
    <Wrapper>
      <PullJobsPanel
        installations={installations}
        modelConfigExists={modelConfigExists}
      />
    </Wrapper>,
    { mountedRoutes: { '/agent-platform/models': modelsRouteRef } },
  );
}

beforeEach(() => {
  listJobs.mockReset();
  cancelJob.mockReset();
});

describe('formatJobProgress', () => {
  it('shows bytes and percent when the total is known', () => {
    expect(formatJobProgress({ ...running, installation: 'lab' })).toBe(
      '114 MiB / 381 MiB (30%)',
    );
  });

  it('shows only what is known', () => {
    expect(
      formatJobProgress({
        ...running,
        installation: 'lab',
        bytesTotal: 0,
        bytesCompleted: 0,
        percent: 0,
      }),
    ).toBe('');
    expect(
      formatJobProgress({
        ...running,
        installation: 'lab',
        bytesTotal: undefined,
        bytesCompleted: 1024,
      }),
    ).toBe('1.0 KiB');
  });
});

describe('PullJobsPanel', () => {
  it('renders nothing when there are no jobs', async () => {
    listJobs.mockResolvedValue([]);

    const { container } = await render();

    await waitFor(() => expect(listJobs).toHaveBeenCalledWith('lab'));
    expect(screen.queryByText('Model downloads')).not.toBeInTheDocument();
    expect(container.textContent).toBe('');
  });

  it('shows a running download with its progress and a cancel button', async () => {
    listJobs.mockResolvedValue([running]);

    await render();

    expect(await screen.findByText('Model downloads')).toBeInTheDocument();
    expect(screen.getByText('qwen2.5:1.5b')).toBeInTheDocument();
    expect(screen.getByText('Downloading')).toBeInTheDocument();
    expect(
      screen.getByText(/lab · pulling 6f7f… · 114 MiB \/ 381 MiB \(30%\)/),
    ).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '30',
    );
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('cancels a running job on request', async () => {
    listJobs.mockResolvedValue([running]);
    cancelJob.mockResolvedValue({ ...running, phase: 'cancelled' });

    await render();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Cancel' }),
    );

    await waitFor(() =>
      expect(cancelJob).toHaveBeenCalledWith('lab', 'running-1'),
    );
  });

  it('shows finished pulls with their outcome and links the wired model config', async () => {
    listJobs.mockResolvedValue(finished);

    await render();

    expect(await screen.findByText('qwen2.5:0.5b')).toBeInTheDocument();
    expect(screen.getAllByText('Done')).toHaveLength(2);
    const link = screen.getByRole('link', { name: 'kagent/qwen2-5-0-5b' });
    expect(link).toHaveAttribute(
      'href',
      '/agent-platform/models/configs/lab/kagent/qwen2-5-0-5b',
    );
    expect(
      screen.queryByRole('button', { name: 'Cancel' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('shows a failed pull with its error', async () => {
    listJobs.mockResolvedValue([
      {
        ...running,
        phase: 'failed',
        error: 'pull model manifest: file does not exist',
      },
    ]);

    await render();

    expect(await screen.findByText('Failed')).toBeInTheDocument();
    expect(
      screen.getByText('pull model manifest: file does not exist'),
    ).toBeInTheDocument();
  });

  it('says when an installation’s downloads could not be read', async () => {
    const error = new Error('token rejected');
    error.name = 'UnauthorizedError';
    listJobs.mockRejectedValue(error);

    await render();

    expect(
      await screen.findByText(
        /Could not read the downloads of lab: token rejected/,
      ),
    ).toBeInTheDocument();
  });

  it('does not link a wired model config that has since been removed', async () => {
    listJobs.mockResolvedValue([finished[0]]);

    await render(
      ['lab'],
      (installation, namespace, name) =>
        !(
          installation === 'lab' &&
          namespace === 'kagent' &&
          name === 'qwen2-5-0-5b'
        ),
    );

    expect(
      await screen.findByText(
        /Model config kagent\/qwen2-5-0-5b was created and has since been removed/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'kagent/qwen2-5-0-5b' }),
    ).not.toBeInTheDocument();
  });
});
