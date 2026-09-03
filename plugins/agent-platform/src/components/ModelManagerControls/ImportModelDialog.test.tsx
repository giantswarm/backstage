import { PropsWithChildren } from 'react';
import {
  renderInTestApp,
  TestApiProvider,
} from '@backstage/frontend-test-utils';
import { toastApiRef } from '@backstage/frontend-plugin-api';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { modelManagerApiRef } from '../../apis';
import type { ModelManagerApi } from '../../apis/ModelManagerApi';
import searchFixture from '../../lib/__fixtures__/model-manager.search.kserve.json';
import fitFixture from '../../lib/__fixtures__/model-manager.fit.kserve.json';
import {
  modelManagerFitResultSchema,
  modelManagerSearchResultSchema,
  parseModelManagerList,
} from '../../lib/modelManager';
import type { GpuNode } from '../../lib/serving';
import {
  describeFit,
  describeSearchResult,
  ImportModelDialog,
  SEARCH_LIMIT,
  type ImportTarget,
} from './ImportModelDialog';

const searchModels = jest.fn();
const fitCheck = jest.fn();
const pullModel = jest.fn();
const post = jest.fn();
const onOpenChange = jest.fn();

const modelManagerApi = {
  searchModels,
  fitCheck,
  pullModel,
} as unknown as ModelManagerApi;

const results = parseModelManagerList(
  searchFixture,
  'results',
  modelManagerSearchResultSchema,
);
const fits = modelManagerFitResultSchema.parse(fitFixture);

const node: GpuNode = {
  id: 'gpu/gpu-node-1',
  installation: 'gpu',
  name: 'gpu-node-1',
  ready: true,
  memoryBudgetBytes: 92417933312,
  memoryFreeBytes: 30140907520,
};

const target: ImportTarget = { name: 'gpu', nodes: [node] };

function render(targets: ImportTarget[] = [target]) {
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
      <ImportModelDialog isOpen onOpenChange={onOpenChange} targets={targets} />
    </Wrapper>,
  );
}

async function search(query: string) {
  await userEvent.type(screen.getByRole('textbox', { name: 'Search' }), query);
  await userEvent.click(screen.getByRole('button', { name: 'Search' }));
  await waitFor(() => expect(searchModels).toHaveBeenCalled());
}

const downloadButton = () =>
  screen.getByRole('button', { name: /Download|Starting/ });

beforeEach(() => {
  [searchModels, fitCheck, pullModel, post, onOpenChange].forEach(fn =>
    fn.mockReset(),
  );
  searchModels.mockResolvedValue(results);
  fitCheck.mockResolvedValue(fits);
  pullModel.mockResolvedValue({ job: { id: 'j1' }, created: true });
});

describe('describeSearchResult / describeFit', () => {
  it('summarises a hit and a verdict', () => {
    // Counts follow the user's locale, as everywhere else in the tab.
    expect(describeSearchResult(results[0])).toBe(
      `text-generation · transformers · ${(2831456).toLocaleString()} downloads · ${(512).toLocaleString()} likes · preset qwen3-14b`,
    );
    expect(describeFit(fits)).toBe(
      'Download 27.6 GiB; needs 57.5 GiB (27.5 GiB of weights per safetensors-index + 30.0 GiB of serving headroom); gpu-node-1 has 86.1 GiB free of 86.1 GiB (allocatable)',
    );
  });
});

describe('ImportModelDialog', () => {
  it('searches the hub, checks the fit of the chosen hit on the node, and starts the download', async () => {
    await render();
    expect(downloadButton()).toBeDisabled();

    await search('qwen3 14b');
    expect(searchModels).toHaveBeenCalledWith('gpu', 'qwen3 14b', SEARCH_LIMIT);
    expect(
      screen.getByRole('radio', { name: 'Qwen/Qwen3-14B' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Gated')).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('radio', { name: 'Qwen/Qwen3-14B' }),
    );

    // The hit's single preset and the single node are the defaults.
    await waitFor(() =>
      expect(fitCheck).toHaveBeenCalledWith('gpu', {
        model: 'Qwen/Qwen3-14B',
        preset: 'qwen3-14b',
        node: 'gpu-node-1',
      }),
    );
    expect(await screen.findByText('Fits on gpu-node-1')).toBeInTheDocument();
    expect(screen.getByText(/Download 27\.6 GiB/)).toBeInTheDocument();
    expect(downloadButton()).toBeEnabled();

    await userEvent.click(downloadButton());

    await waitFor(() =>
      expect(pullModel).toHaveBeenCalledWith('gpu', {
        model: 'Qwen/Qwen3-14B',
        preset: 'qwen3-14b',
        node: 'gpu-node-1',
      }),
    );
    // Never `wire`: on kserve models are wired when served.
    expect(pullModel.mock.calls[0][1]).not.toHaveProperty('wire');
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(post).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Downloading Qwen/Qwen3-14B on gpu',
        description: expect.stringContaining('Into the cache on gpu-node-1'),
      }),
    );
  });

  it('refuses to submit a model that does not fit, saying why', async () => {
    fitCheck.mockResolvedValue({
      ...fits,
      fits: false,
      reason: '104.8 GiB exceed the 86.1 GiB available on gpu-node-1',
    });
    await render();
    await search('qwen3');
    await userEvent.click(
      screen.getByRole('radio', { name: 'Qwen/Qwen3-14B' }),
    );

    expect(
      await screen.findByText('Does not fit on gpu-node-1'),
    ).toBeInTheDocument();
    expect(screen.getByText(/104\.8 GiB exceed/)).toBeInTheDocument();
    expect(downloadButton()).toBeDisabled();
    expect(pullModel).not.toHaveBeenCalled();
  });

  it('blocks a gated repository until the installation has a hub token', async () => {
    fitCheck.mockResolvedValue({
      ...fits,
      model: 'meta-llama/Llama-3.3-70B-Instruct',
      gated: true,
      tokenConfigured: false,
    });
    await render();
    await search('llama');
    await userEvent.click(
      screen.getByRole('radio', { name: 'meta-llama/Llama-3.3-70B-Instruct' }),
    );

    expect(await screen.findByText('Gated repository')).toBeInTheDocument();
    expect(screen.getByText(/has none configured/)).toBeInTheDocument();
    expect(downloadButton()).toBeDisabled();
  });

  it('says when the model is already cached and lets model-manager pick the node with several', async () => {
    fitCheck.mockResolvedValue({ ...fits, cached: true });
    await render([
      {
        name: 'gpu',
        nodes: [node, { ...node, id: 'gpu/gpu-node-2', name: 'gpu-node-2' }],
      },
    ]);
    await search('qwen3');
    await userEvent.click(
      screen.getByRole('radio', { name: 'Qwen/Qwen3-14B' }),
    );

    await waitFor(() =>
      expect(fitCheck).toHaveBeenCalledWith('gpu', {
        model: 'Qwen/Qwen3-14B',
        preset: 'qwen3-14b',
      }),
    );
    expect(
      await screen.findByText('Already in the cache on gpu-node-1'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Target node/ }),
    ).toHaveTextContent('Best node');
  });

  it('stays open with the refusal when model-manager rejects the download', async () => {
    const refused = new Error(
      'model does not fit: 104.8 GiB exceed the 86.1 GiB available',
    );
    refused.name = 'PreconditionFailedError';
    pullModel.mockRejectedValue(refused);
    await render();
    await search('qwen3');
    await userEvent.click(
      screen.getByRole('radio', { name: 'Qwen/Qwen3-14B' }),
    );
    await screen.findByText('Fits on gpu-node-1');

    await userEvent.click(downloadButton());

    expect(
      await screen.findByText('The download could not be started'),
    ).toBeInTheDocument();
    expect(screen.getByText(/104\.8 GiB exceed/)).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('reports a hub that cannot be searched and an empty result', async () => {
    searchModels.mockRejectedValueOnce(new Error('hub unreachable'));
    await render();
    await search('anything');
    expect(
      await screen.findByText('The hub could not be searched'),
    ).toBeInTheDocument();
    expect(screen.getByText('hub unreachable')).toBeInTheDocument();

    searchModels.mockResolvedValue([]);
    await userEvent.clear(screen.getByRole('textbox', { name: 'Search' }));
    await search('nothing-like-this');
    expect(
      await screen.findByText(/Nothing on the hub matches "nothing-like-this"/),
    ).toBeInTheDocument();
  });
});
