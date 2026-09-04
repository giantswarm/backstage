import { PropsWithChildren } from 'react';
import {
  renderInTestApp,
  TestApiProvider,
} from '@backstage/frontend-test-utils';
import { toastApiRef } from '@backstage/frontend-plugin-api';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { modelManagerApiRef } from '../../apis';
import type { ModelManagerApi } from '../../apis/ModelManagerApi';
import {
  NO_SERVING_CAPABILITIES,
  type ServingCapabilities,
} from '../../lib/serving';
import type { ServedModelDownloadRow } from '../ServingPage/ServedModelsTable';
import { DownloadRowActions } from './DownloadRowActions';

const cancelJob = jest.fn();
const pullModel = jest.fn();
const post = jest.fn();
const modelManagerApi = { cancelJob, pullModel } as unknown as ModelManagerApi;

const ollamaCapabilities: ServingCapabilities = {
  ...NO_SERVING_CAPABILITIES,
  pull: true,
  pullProgress: true,
  wire: true,
};

const running: ServedModelDownloadRow = {
  kind: 'download',
  id: 'lab/ollama/download/running-1',
  installation: 'lab',
  backend: 'ollama',
  name: 'qwen2.5:1.5b',
  readiness: 'downloading',
  endpointHosts: [],
  operable: false,
  usedBy: [],
  download: {
    jobId: 'running-1',
    phase: 'running',
    status: 'pulling 6f7f…',
    bytesCompleted: 120_000_000,
    bytesTotal: 400_000_000,
    percent: 30,
    wire: false,
  },
};

const failed: ServedModelDownloadRow = {
  ...running,
  id: 'lab/ollama/download/failed-1',
  name: 'nope:latest',
  readiness: 'notReady',
  download: {
    jobId: 'failed-1',
    phase: 'failed',
    error: 'pull model manifest: file does not exist',
    wire: true,
  },
};

function render(
  row: ServedModelDownloadRow,
  capabilities = ollamaCapabilities,
  onDismiss = jest.fn(),
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: PropsWithChildren<{}>) => (
    <TestApiProvider
      apis={[
        [modelManagerApiRef, modelManagerApi],
        [toastApiRef, { post }],
      ]}
    >
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </TestApiProvider>
  );
  return renderInTestApp(
    <Wrapper>
      <DownloadRowActions
        row={row}
        capabilities={capabilities}
        onDismiss={onDismiss}
      />
    </Wrapper>,
  );
}

async function openMenu(name: string) {
  await userEvent.click(
    screen.getByRole('button', { name: `Actions for ${name}` }),
  );
  return screen.getByRole('menu');
}

beforeEach(() => {
  [cancelJob, pullModel, post].forEach(fn => fn.mockReset());
});

describe('DownloadRowActions', () => {
  it('offers only Cancel on a pull in flight, and cancels the job on click', async () => {
    cancelJob.mockResolvedValue({ id: 'running-1', phase: 'cancelled' });
    await render(running);
    const menu = await openMenu('qwen2.5:1.5b');

    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map(item => item.textContent),
    ).toEqual(['Cancel download']);

    await userEvent.click(within(menu).getByRole('menuitem'));

    await waitFor(() =>
      expect(cancelJob).toHaveBeenCalledWith('lab', 'running-1'),
    );
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Download of qwen2.5:1.5b cancelled',
          status: 'success',
        }),
      ),
    );
  });

  it('reports a cancel the backend refused', async () => {
    cancelJob.mockRejectedValue(new Error('job is not running'));
    await render(running);
    await userEvent.click(
      within(await openMenu('qwen2.5:1.5b')).getByRole('menuitem'),
    );

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Could not cancel the download of qwen2.5:1.5b',
          description: 'job is not running',
          status: 'danger',
        }),
      ),
    );
  });

  it('offers Retry and Dismiss on a failed pull; Retry pulls again with the wiring choice and dismisses the failure', async () => {
    pullModel.mockResolvedValue({
      job: { id: 'retry-1', model: 'nope:latest', phase: 'pending' },
      created: true,
    });
    const onDismiss = jest.fn();
    await render(failed, ollamaCapabilities, onDismiss);
    const menu = await openMenu('nope:latest');

    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map(item => item.textContent),
    ).toEqual(['Retry download', 'Dismiss']);

    await userEvent.click(
      within(menu).getByRole('menuitem', { name: 'Retry download' }),
    );

    await waitFor(() =>
      expect(pullModel).toHaveBeenCalledWith('lab', {
        model: 'nope:latest',
        backend: 'ollama',
        wire: true,
      }),
    );
    await waitFor(() => expect(onDismiss).toHaveBeenCalledWith(failed));
    expect(post).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Pulling nope:latest again' }),
    );
  });

  it('retries without the wire flag where the backend does not wire, and keeps the failure when the retry is refused', async () => {
    pullModel.mockRejectedValue(new Error('does not fit on any node'));
    const onDismiss = jest.fn();
    await render(failed, { ...ollamaCapabilities, wire: false }, onDismiss);
    await userEvent.click(
      within(await openMenu('nope:latest')).getByRole('menuitem', {
        name: 'Retry download',
      }),
    );

    await waitFor(() =>
      expect(pullModel).toHaveBeenCalledWith('lab', {
        model: 'nope:latest',
        backend: 'ollama',
      }),
    );
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Could not retry the download of nope:latest',
          status: 'danger',
        }),
      ),
    );
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('retries a KServe download with the preset and node the job names, and without the wire flag', async () => {
    pullModel.mockResolvedValue({
      job: {
        id: 'retry-2',
        model: 'org/tiny',
        phase: 'pending',
        node: 'gpu-node-1',
        preset: 'tiny',
      },
      created: true,
    });
    const onDismiss = jest.fn();
    const kserveFailed: ServedModelDownloadRow = {
      ...failed,
      id: 'gpu/kserve/download/failed-2',
      installation: 'gpu',
      backend: 'kserve',
      name: 'org/tiny',
      node: 'gpu-node-1',
      preset: 'tiny',
      download: { ...failed.download, jobId: 'failed-2', wire: false },
    };
    await render(
      kserveFailed,
      {
        ...ollamaCapabilities,
        wire: false,
        presets: true,
        nodeInventory: true,
      },
      onDismiss,
    );
    await userEvent.click(
      within(await openMenu('org/tiny')).getByRole('menuitem', {
        name: 'Retry download',
      }),
    );

    await waitFor(() =>
      expect(pullModel).toHaveBeenCalledWith('gpu', {
        model: 'org/tiny',
        backend: 'kserve',
        preset: 'tiny',
        node: 'gpu-node-1',
      }),
    );
    await waitFor(() => expect(onDismiss).toHaveBeenCalledWith(kserveFailed));
  });

  it('dismisses a failure without asking the backend', async () => {
    const onDismiss = jest.fn();
    await render(failed, ollamaCapabilities, onDismiss);
    await userEvent.click(
      within(await openMenu('nope:latest')).getByRole('menuitem', {
        name: 'Dismiss',
      }),
    );

    expect(onDismiss).toHaveBeenCalledWith(failed);
    expect(cancelJob).not.toHaveBeenCalled();
    expect(pullModel).not.toHaveBeenCalled();
  });
});
