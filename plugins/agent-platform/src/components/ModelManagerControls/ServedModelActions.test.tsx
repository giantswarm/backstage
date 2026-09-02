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
import { ServedModelActions } from './ServedModelActions';

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
  endpointHosts: ['172.21.0.1'],
  loaded: false,
};

const loadedWired: ServedModel = {
  ...unloadedUnwired,
  id: 'lab/ollama//qwen3.5:9b',
  name: 'qwen3.5:9b',
  readiness: 'ready',
  loaded: true,
  modelConfig: { name: 'qwen3-5-9b', namespace: 'kagent', ready: true },
};

function render(model: ServedModel, capabilities = ollamaCapabilities) {
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
      <ServedModelActions model={model} capabilities={capabilities} />
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
});
