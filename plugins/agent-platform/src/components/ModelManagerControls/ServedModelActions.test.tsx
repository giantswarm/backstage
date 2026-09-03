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
  type ServedModel,
  type ServingCapabilities,
} from '../../lib/serving';
import { hasRowActions, ServedModelActions } from './ServedModelActions';

const loadModel = jest.fn();
const unloadModel = jest.fn();
const deleteModel = jest.fn();
const wireModel = jest.fn();
const unwireModel = jest.fn();
const post = jest.fn();

const modelManagerApi = {
  loadModel,
  unloadModel,
  deleteModel,
  wireModel,
  unwireModel,
} as unknown as ModelManagerApi;

const ollamaCapabilities: ServingCapabilities = {
  ...NO_SERVING_CAPABILITIES,
  pull: true,
  pullProgress: true,
  delete: true,
  load: true,
  unload: true,
  loadedModels: true,
  wire: true,
};

const unloadedUnwired: ServedModel = {
  id: 'lab/ollama//qwen3:0.6b',
  installation: 'lab',
  backend: 'ollama',
  name: 'qwen3:0.6b',
  readiness: 'available',
  endpointHosts: ['172.21.0.1:11434'],
  loaded: false,
  managerRef: 'qwen3:0.6b',
  operable: true,
};

const loadedWired: ServedModel = {
  ...unloadedUnwired,
  id: 'lab/ollama//qwen3.5:9b',
  name: 'qwen3.5:9b',
  readiness: 'ready',
  loaded: true,
  managerRef: 'qwen3.5:9b',
  modelConfig: { name: 'qwen3-5-9b', namespace: 'kagent', ready: true },
};

const kserveCapabilities: ServingCapabilities = {
  ...ollamaCapabilities,
  presets: true,
  fitCheck: true,
  nodeInventory: true,
  search: true,
};

/** A served InferenceService as the provider folds it: CR identity, model-manager's inventory. */
const servedKserve: ServedModel = {
  id: 'gpu/kserve/model-serving/qwen3-14b',
  installation: 'gpu',
  backend: 'kserve',
  name: 'qwen3-14b',
  namespace: 'model-serving',
  readiness: 'ready',
  endpointHosts: ['qwen3-14b-predictor.model-serving.svc.cluster.local'],
  managerRef: 'Qwen/Qwen3-14B',
  loaded: true,
  downloaded: true,
  cachePath: 'qwen3-14b',
  // The portal's own wiring: recognised, not owned.
  modelConfig: {
    name: 'qwen3-14b',
    namespace: 'kagent',
    managed: false,
    ready: true,
  },
  operable: true,
};

/** A cached download nobody serves. */
const cachedKserve: ServedModel = {
  id: 'gpu/kserve/cache/gpu-node-1/devstral-small-2',
  installation: 'gpu',
  backend: 'kserve',
  name: 'mistralai/Devstral-Small-2-24B-Instruct-2512',
  readiness: 'available',
  node: 'gpu-node-1',
  endpointHosts: [],
  managerRef: 'mistralai/Devstral-Small-2-24B-Instruct-2512',
  loaded: false,
  downloaded: true,
  cachePath: 'devstral-small-2',
  operable: true,
};

function render(
  model: ServedModel,
  capabilities = ollamaCapabilities,
  offers: {
    onServe?: (model: ServedModel) => void;
    onStop?: (model: ServedModel) => void;
  } = {},
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
      <ServedModelActions
        model={model}
        capabilities={capabilities}
        onServe={offers.onServe}
        onStop={offers.onStop}
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
  [loadModel, unloadModel, deleteModel, wireModel, unwireModel, post].forEach(
    fn => fn.mockReset(),
  );
});

describe('ServedModelActions', () => {
  it('offers Load and Create model config for an unloaded, unwired model', async () => {
    await render(unloadedUnwired);
    const menu = await openMenu('qwen3:0.6b');

    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map(item => item.textContent),
    ).toEqual(['Load', 'Create model config', 'Delete…']);
  });

  it('offers Unload and Remove model config for a loaded, wired model', async () => {
    await render(loadedWired);
    const menu = await openMenu('qwen3.5:9b');

    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map(item => item.textContent),
    ).toEqual(['Unload', 'Remove model config', 'Delete…']);
  });

  it('renders per capability flag: no load/unload without them, no wiring without wire', async () => {
    await render(unloadedUnwired, {
      ...NO_SERVING_CAPABILITIES,
      delete: true,
    });
    const menu = await openMenu('qwen3:0.6b');

    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map(item => item.textContent),
    ).toEqual(['Delete…']);
  });

  it('renders nothing when the installation offers no operation at all', async () => {
    await render(unloadedUnwired, {
      ...NO_SERVING_CAPABILITIES,
      nodeInventory: true,
    });

    expect(
      screen.queryByRole('button', { name: /Actions for/ }),
    ).not.toBeInTheDocument();
  });

  it('loads the model on click and reports through a toast', async () => {
    loadModel.mockResolvedValue({ name: 'qwen3:0.6b', loaded: true });
    await render(unloadedUnwired);
    const menu = await openMenu('qwen3:0.6b');

    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Load' }));

    await waitFor(() =>
      expect(loadModel).toHaveBeenCalledWith('lab', { model: 'qwen3:0.6b' }),
    );
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'qwen3:0.6b: loaded into memory',
          status: 'success',
        }),
      ),
    );
  });

  it('reports a failed operation in a toast, naming it', async () => {
    const forbidden = new Error('Capability not supported by the backend');
    forbidden.name = 'ForbiddenError';
    unloadModel.mockRejectedValue(forbidden);
    await render(loadedWired);
    const menu = await openMenu('qwen3.5:9b');

    await userEvent.click(
      within(menu).getByRole('menuitem', { name: 'Unload' }),
    );

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Unload failed for qwen3.5:9b',
          description: 'Capability not supported by the backend',
          status: 'danger',
        }),
      ),
    );
  });

  it('asks before deleting, unwiring by default, and closes on success', async () => {
    deleteModel.mockResolvedValue(undefined);
    await render(loadedWired);
    const menu = await openMenu('qwen3.5:9b');

    await userEvent.click(
      within(menu).getByRole('menuitem', { name: 'Delete…' }),
    );

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Delete qwen3.5:9b?')).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        /Also remove its model config kagent\/qwen3-5-9b/,
      ),
    ).toBeInTheDocument();
    expect(deleteModel).not.toHaveBeenCalled();

    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Delete model' }),
    );

    await waitFor(() =>
      expect(deleteModel).toHaveBeenCalledWith('lab', 'qwen3.5:9b', {
        unwire: true,
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(post).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'qwen3.5:9b deleted',
        status: 'success',
      }),
    );
  });

  it('keeps the model config when asked to', async () => {
    deleteModel.mockResolvedValue(undefined);
    await render(loadedWired);
    const menu = await openMenu('qwen3.5:9b');
    await userEvent.click(
      within(menu).getByRole('menuitem', { name: 'Delete…' }),
    );
    const dialog = await screen.findByRole('dialog');

    await userEvent.click(within(dialog).getByRole('switch'));
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Delete model' }),
    );

    await waitFor(() =>
      expect(deleteModel).toHaveBeenCalledWith('lab', 'qwen3.5:9b', {
        unwire: false,
      }),
    );
  });

  it('offers no unwire choice for a model without a model config and leaves the server default', async () => {
    await render(unloadedUnwired);
    const menu = await openMenu('qwen3:0.6b');
    await userEvent.click(
      within(menu).getByRole('menuitem', { name: 'Delete…' }),
    );
    const dialog = await screen.findByRole('dialog');

    expect(within(dialog).queryByRole('switch')).not.toBeInTheDocument();
    deleteModel.mockResolvedValue(undefined);
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Delete model' }),
    );
    await waitFor(() =>
      expect(deleteModel).toHaveBeenCalledWith('lab', 'qwen3:0.6b', {
        unwire: true,
      }),
    );
  });

  it('never asks the backend to unwire when it cannot wire', async () => {
    deleteModel.mockResolvedValue(undefined);
    await render(loadedWired, { ...NO_SERVING_CAPABILITIES, delete: true });
    const menu = await openMenu('qwen3.5:9b');
    await userEvent.click(
      within(menu).getByRole('menuitem', { name: 'Delete…' }),
    );
    const dialog = await screen.findByRole('dialog');

    expect(within(dialog).queryByRole('switch')).not.toBeInTheDocument();
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Delete model' }),
    );
    await waitFor(() =>
      expect(deleteModel).toHaveBeenCalledWith('lab', 'qwen3.5:9b', {
        unwire: false,
      }),
    );
  });

  it('keeps the dialog open with the error when the delete fails', async () => {
    deleteModel.mockRejectedValue(new Error('backend_error: ollama refused'));
    await render(loadedWired);
    const menu = await openMenu('qwen3.5:9b');
    await userEvent.click(
      within(menu).getByRole('menuitem', { name: 'Delete…' }),
    );
    const dialog = await screen.findByRole('dialog');

    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Delete model' }),
    );

    expect(
      await within(dialog).findByText('backend_error: ollama refused'),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
  describe('on KServe rows', () => {
    it('offers Serve… on a cached download through the section, and Delete… for the cache', async () => {
      const onServe = jest.fn();
      await render(cachedKserve, kserveCapabilities, { onServe });
      const menu = await openMenu(cachedKserve.name);

      expect(within(menu).getByText('Serve…')).toBeInTheDocument();
      expect(within(menu).queryByText('Load')).not.toBeInTheDocument();
      expect(within(menu).queryByText(/Stop serving/)).not.toBeInTheDocument();
      // Nothing to wire before it serves.
      expect(
        within(menu).queryByText('Create model config'),
      ).not.toBeInTheDocument();
      expect(within(menu).getByText('Delete…')).toBeInTheDocument();

      await userEvent.click(within(menu).getByText('Serve…'));
      expect(onServe).toHaveBeenCalledWith(cachedKserve);
      expect(loadModel).not.toHaveBeenCalled();
    });

    it("falls back to model-manager's own load, worded as Serve, when the section offers no serve flow", async () => {
      loadModel.mockResolvedValue({});
      await render(cachedKserve, kserveCapabilities);
      const menu = await openMenu(cachedKserve.name);

      await userEvent.click(within(menu).getByText('Serve'));

      await waitFor(() =>
        expect(loadModel).toHaveBeenCalledWith('gpu', {
          model: 'mistralai/Devstral-Small-2-24B-Instruct-2512',
        }),
      );
    });

    it('offers one Stop serving… on a served InferenceService and no Unload, Delete or unwire of a recognised model config', async () => {
      const onStop = jest.fn();
      await render(servedKserve, kserveCapabilities, { onStop });
      const menu = await openMenu('qwen3-14b');

      expect(within(menu).getAllByRole('menuitem')).toHaveLength(1);
      expect(within(menu).getByText('Stop serving…')).toBeInTheDocument();
      expect(within(menu).queryByText('Unload')).not.toBeInTheDocument();
      // The cache cannot be deleted while it serves; the ModelConfig is the
      // portal's, so model-manager may not remove it.
      expect(within(menu).queryByText('Delete…')).not.toBeInTheDocument();
      expect(
        within(menu).queryByText('Remove model config'),
      ).not.toBeInTheDocument();

      await userEvent.click(within(menu).getByText('Stop serving…'));
      expect(onStop).toHaveBeenCalledWith(servedKserve);
      expect(unloadModel).not.toHaveBeenCalled();
    });

    it('offers to remove a model config model-manager created itself, by the InferenceService name', async () => {
      unwireModel.mockResolvedValue(undefined);
      await render(
        {
          ...servedKserve,
          modelConfig: { ...servedKserve.modelConfig!, managed: true },
        },
        kserveCapabilities,
        { onStop: jest.fn() },
      );
      const menu = await openMenu('qwen3-14b');

      await userEvent.click(within(menu).getByText('Remove model config'));

      await waitFor(() =>
        expect(unwireModel).toHaveBeenCalledWith('gpu', 'qwen3-14b'),
      );
    });

    it('renders no menu at all for a CR the source only reads, unless the section offers a stop', async () => {
      const readOnly: ServedModel = {
        ...servedKserve,
        managerRef: undefined,
        operable: undefined,
        modelConfig: undefined,
      };
      expect(hasRowActions(readOnly, NO_SERVING_CAPABILITIES)).toBe(false);
      expect(
        hasRowActions(readOnly, NO_SERVING_CAPABILITIES, { onStop: () => {} }),
      ).toBe(true);
      expect(hasRowActions(cachedKserve, kserveCapabilities)).toBe(true);
      expect(hasRowActions(unloadedUnwired, ollamaCapabilities)).toBe(true);
      expect(
        hasRowActions(
          { ...unloadedUnwired, operable: undefined },
          ollamaCapabilities,
        ),
      ).toBe(false);

      const { unmount } = await render(readOnly, NO_SERVING_CAPABILITIES);
      expect(
        screen.queryByRole('button', { name: /Actions for/ }),
      ).not.toBeInTheDocument();
      unmount();

      await render(readOnly, NO_SERVING_CAPABILITIES, { onStop: jest.fn() });
      const menu = await openMenu('qwen3-14b');
      expect(within(menu).getAllByRole('menuitem')).toHaveLength(1);
      expect(within(menu).getByText('Stop serving…')).toBeInTheDocument();
    });
  });
});
