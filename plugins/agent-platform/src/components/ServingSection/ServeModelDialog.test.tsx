import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { GpuNode } from '../../lib/serving';
import type {
  ModelServingConfig,
  ServingPreset,
} from '../../lib/servingPresets';
import {
  cacheNotice,
  ServeModelDialog,
  storageUriForDownload,
  type DownloadedModelOption,
} from './ServeModelDialog';

const GIB = 2 ** 30;

const config: ModelServingConfig = {
  installation: 'inst-1',
  namespace: 'model-serving',
  runtime: 'kserve-vllm',
  gpuResourceName: 'nvidia.com/gpu',
  nodeSelector: {},
  deploymentStrategyType: 'Recreate',
  timeoutSeconds: 1800,
  cache: {
    enabled: true,
    claimName: 'hf-cache',
    mountPath: '/mnt/models',
    redirectPolicy: false,
  },
  presets: {
    namespace: 'agent-platform',
    matchingLabels: { 'agent-platform.giantswarm.io/serving-preset': 'true' },
    names: ['qwen3-14b', 'nemotron'],
  },
};

const qwen: ServingPreset = {
  installation: 'inst-1',
  name: 'qwen3-14b',
  displayName: 'Qwen3 14B',
  description: 'Dense 14B general model.',
  model: {
    id: 'Qwen/Qwen3-14B',
    storageUri: 'hf://Qwen/Qwen3-14B',
    format: 'vLLM',
    contextLength: 8192,
    capabilities: ['chat', 'tools'],
  },
  runtime: 'kserve-vllm',
  args: ['--max-model-len=8192'],
  env: [],
  resources: { gpus: 1, requests: {}, limits: {} },
  requirements: { weightsGiB: 28, overheadGiB: 30 },
  scheduling: { nodeSelector: {}, tolerations: [] },
  predictor: {},
};

const nemotron: ServingPreset = {
  ...qwen,
  name: 'nemotron',
  displayName: 'Nemotron 3 Super',
  description: undefined,
  model: {
    ...qwen.model,
    id: 'nvidia/Nemotron',
    storageUri: 'hf://nvidia/Nemotron',
  },
  requirements: { weightsGiB: 75, overheadGiB: 30 },
};

/** A unified-memory node with 86 GiB allocatable: qwen fits (58), nemotron (105) does not. */
const spark: GpuNode = {
  id: 'inst-1/spark',
  installation: 'inst-1',
  name: 'spark',
  ready: true,
  product: 'NVIDIA-GB10',
  memoryMiB: 122880,
  labeledCount: 1,
  memoryAllocatableBytes: 86 * GIB,
  schedulable: true,
};

const onConfirm = jest.fn();
const onOpenChange = jest.fn();
const onInstallationChange = jest.fn();

function renderDialog(
  props: Partial<Parameters<typeof ServeModelDialog>[0]> = {},
) {
  return render(
    <ServeModelDialog
      isOpen
      onOpenChange={onOpenChange}
      installations={['inst-1']}
      installation="inst-1"
      onInstallationChange={onInstallationChange}
      presets={[qwen, nemotron]}
      config={config}
      gpuNodes={[spark]}
      existingNames={[]}
      permission={{ allowed: true, isLoading: false }}
      isServing={false}
      onConfirm={onConfirm}
      {...props}
    />,
  );
}

const nameField = () => screen.getByRole('textbox', { name: 'Name' });
const sourceField = () => screen.getByRole('textbox', { name: 'Model source' });
const serveButton = () => screen.getByRole('button', { name: 'Serve model' });

async function choosePreset(label: string) {
  await userEvent.click(screen.getByRole('button', { name: /Preset/ }));
  await userEvent.click(screen.getByRole('option', { name: label }));
}

beforeEach(() => {
  onConfirm.mockReset();
  onOpenChange.mockReset();
  onInstallationChange.mockReset();
});

describe('ServeModelDialog', () => {
  it('seeds the form from the first preset and the single GPU node', () => {
    renderDialog();

    expect(screen.getByText('Serve a model')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Preset/ })).toHaveTextContent(
      'Qwen3 14B',
    );
    expect(
      screen.getByText(/Qwen\/Qwen3-14B · 28 GiB of weights · 1 GPU/),
    ).toBeInTheDocument();
    expect(screen.getByText('Dense 14B general model.')).toBeInTheDocument();
    expect(nameField()).toHaveValue('qwen3-14b');
    expect(sourceField()).toHaveValue('hf://Qwen/Qwen3-14B');
    expect(
      screen.getByRole('button', { name: /Target node/ }),
    ).toHaveTextContent('spark');
    // The fit check ran against that node.
    expect(screen.getByText('Fits on spark')).toBeInTheDocument();
    expect(screen.getByText(/unified memory/)).toBeInTheDocument();
    // Installation select is not offered for a single installation.
    expect(
      screen.queryByRole('button', { name: /Installation/ }),
    ).not.toBeInTheDocument();
  });

  it('composes the InferenceService from the preset, the config and the choices', async () => {
    renderDialog();

    await userEvent.clear(nameField());
    await userEvent.type(nameField(), 'qwen3-14b-eval');
    await userEvent.type(
      screen.getByRole('textbox', { name: /Additional vLLM arguments/ }),
      '--max-num-seqs=2',
    );
    await userEvent.click(serveButton());

    expect(onConfirm).toHaveBeenCalledTimes(1);
    const { manifest, request, preset } = onConfirm.mock.calls[0][0];
    expect(preset.name).toBe('qwen3-14b');
    expect(request).toMatchObject({
      installation: 'inst-1',
      name: 'qwen3-14b-eval',
      storageUri: 'hf://Qwen/Qwen3-14B',
      gpus: 1,
      node: 'spark',
      acknowledgeFit: false,
    });
    expect(manifest).toMatchObject({
      metadata: {
        name: 'qwen3-14b-eval',
        namespace: 'model-serving',
        labels: { 'agent-platform.giantswarm.io/preset': 'qwen3-14b' },
        annotations: {
          'agent-platform.giantswarm.io/model-config': 'kagent/qwen3-14b-eval',
        },
      },
      spec: {
        predictor: {
          nodeSelector: { 'kubernetes.io/hostname': 'spark' },
          model: {
            args: ['--max-model-len=8192', '--max-num-seqs=2'],
            resources: { requests: { 'nvidia.com/gpu': '1' } },
          },
        },
      },
    });
    // Confirming does not close the dialog: the create can still fail.
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('re-seeds name and source when the preset changes', async () => {
    renderDialog();

    await choosePreset('Nemotron 3 Super');

    expect(nameField()).toHaveValue('nemotron');
    expect(sourceField()).toHaveValue('hf://nvidia/Nemotron');
  });

  it('blocks a preset that does not fit the node until acknowledged', async () => {
    renderDialog();

    await choosePreset('Nemotron 3 Super');

    expect(screen.getByText('Does not fit on spark')).toBeInTheDocument();
    expect(
      screen.getByText(
        /Needs about 105 GiB of memory \(75 GiB of weights \+ 30 GiB of headroom\), but spark has 86 GiB allocatable/,
      ),
    ).toBeInTheDocument();

    await userEvent.click(serveButton());
    expect(onConfirm).not.toHaveBeenCalled();
    expect(
      screen.getByText(/tick the acknowledgement to serve it anyway/),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('checkbox', { name: /Serve anyway/ }),
    );
    await userEvent.click(serveButton());

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm.mock.calls[0][0].request.acknowledgeFit).toBe(true);
  });

  it('cannot check the fit without a node pin, and says so', async () => {
    renderDialog({ gpuNodes: [] });

    expect(
      screen.getByRole('button', { name: /Target node/ }),
    ).toHaveTextContent('Any node');
    expect(screen.getByText('Fit not checked')).toBeInTheDocument();
    expect(screen.getByText(/Pick a target node to check/)).toBeInTheDocument();

    await userEvent.click(serveButton());
    // Unknown is not a block.
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('refuses advanced arguments the runtime or the preset own', async () => {
    renderDialog();

    await userEvent.type(
      screen.getByRole('textbox', { name: /Additional vLLM arguments/ }),
      '--port=9000',
    );
    await userEvent.click(serveButton());

    expect(onConfirm).not.toHaveBeenCalled();
    expect(
      screen.getByText(/--port=9000 is set by the runtime or the preset/),
    ).toBeInTheDocument();
  });

  it('refuses a name that is already served there', async () => {
    renderDialog({ existingNames: ['qwen3-14b'] });

    await userEvent.click(serveButton());

    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByText(/already exists there/)).toBeInTheDocument();
  });

  it('explains and disables when the user may not create InferenceServices', () => {
    renderDialog({ permission: { allowed: false, isLoading: false } });

    expect(screen.getByText('Not allowed')).toBeInTheDocument();
    expect(
      screen.getByText(
        /may not create InferenceServices in model-serving on inst-1/,
      ),
    ).toBeInTheDocument();
    expect(serveButton()).toBeDisabled();
  });

  it('tells what the network policies and the cache mean for this installation', () => {
    renderDialog();

    expect(screen.getByText('Before agents can use it')).toBeInTheDocument();
    const notice = screen.getByText(/does not yet ship network policies/);
    expect(notice).toHaveTextContent(/reach the predictor in model-serving/);
    expect(notice).toHaveTextContent(/admission policies are off/);
  });

  it('shows a failed attempt and locks while serving', () => {
    const { rerender } = renderDialog({
      error: 'inferenceservices is forbidden',
    });

    expect(
      screen.getByText('The model could not be served'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('inferenceservices is forbidden'),
    ).toBeInTheDocument();

    rerender(
      <ServeModelDialog
        isOpen
        onOpenChange={onOpenChange}
        installations={['inst-1']}
        installation="inst-1"
        onInstallationChange={onInstallationChange}
        presets={[qwen]}
        config={config}
        gpuNodes={[spark]}
        existingNames={[]}
        permission={{ allowed: true, isLoading: false }}
        isServing
        onConfirm={onConfirm}
      />,
    );
    expect(screen.getByRole('button', { name: /Serving…/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });

  it('offers the installation choice when several publish presets', async () => {
    renderDialog({ installations: ['inst-1', 'inst-2'] });

    await userEvent.click(screen.getByRole('button', { name: /Installation/ }));
    await userEvent.click(screen.getByRole('option', { name: 'inst-2' }));

    expect(onInstallationChange).toHaveBeenCalledWith('inst-2');
  });
});

describe('ServeModelDialog with cached downloads', () => {
  const devstralDownload: DownloadedModelOption = {
    id: 'inst-1/kserve/cache/spark/nemotron',
    model: 'nvidia/Nemotron',
    node: 'spark',
    cachePath: 'nemotron',
    preset: 'nemotron',
    sizeBytes: 80 * GIB,
  };

  it('offers the downloads as weights and, picked, names the InferenceService after the cache directory on that node', async () => {
    renderDialog({ downloads: [devstralDownload] });

    const weights = screen.getByRole('button', { name: /Weights/ });
    expect(weights).toHaveTextContent("The preset's source");

    await userEvent.click(weights);
    await userEvent.click(
      screen.getByRole('option', {
        name: 'nvidia/Nemotron · on spark · 80.0 GiB',
      }),
    );

    expect(screen.getByRole('button', { name: /Preset/ })).toHaveTextContent(
      'Nemotron 3 Super',
    );
    expect(nameField()).toHaveValue('nemotron');
    // No admission policy on this installation: serve the claim directly.
    expect(sourceField()).toHaveValue('pvc://hf-cache/nemotron');
    expect(
      screen.getByRole('button', { name: /Target node/ }),
    ).toHaveTextContent('spark');
  });

  it('starts from the download a row was served from, and reverts to the hub source on request', async () => {
    renderDialog({
      downloads: [devstralDownload],
      seed: { download: devstralDownload },
    });

    expect(nameField()).toHaveValue('nemotron');
    expect(sourceField()).toHaveValue('pvc://hf-cache/nemotron');
    expect(screen.getByRole('button', { name: /Weights/ })).toHaveTextContent(
      'nvidia/Nemotron · on spark',
    );

    await userEvent.click(screen.getByRole('button', { name: /Weights/ }));
    await userEvent.click(
      screen.getByRole('option', { name: /The preset's source/ }),
    );
    expect(sourceField()).toHaveValue('hf://nvidia/Nemotron');
  });

  it('keeps the preset source when the cache is wired at admission, and falls back without a claim', () => {
    const withPolicy = {
      ...config,
      cache: { ...config.cache, redirectPolicy: true },
    };
    expect(storageUriForDownload(devstralDownload, withPolicy, nemotron)).toBe(
      'hf://nvidia/Nemotron',
    );
    expect(storageUriForDownload(devstralDownload, config, nemotron)).toBe(
      'pvc://hf-cache/nemotron',
    );
    expect(
      storageUriForDownload(
        devstralDownload,
        { ...config, cache: { enabled: false, redirectPolicy: false } },
        nemotron,
      ),
    ).toBe('hf://nvidia/Nemotron');
    // Cached weights serve from the claim even without a preset; without a
    // known directory there is nothing to point at but the hub.
    expect(storageUriForDownload(devstralDownload, config, undefined)).toBe(
      'pvc://hf-cache/nemotron',
    );
    expect(
      storageUriForDownload(
        { ...devstralDownload, cachePath: undefined },
        config,
        undefined,
      ),
    ).toBe('hf://nvidia/Nemotron');
  });
});

describe('cacheNotice', () => {
  it('describes the three cache situations', () => {
    expect(cacheNotice(config)).toMatch(/admission policies are off/);
    expect(
      cacheNotice({
        ...config,
        cache: { ...config.cache, redirectPolicy: true },
      }),
    ).toMatch(/download once/);
    expect(
      cacheNotice({
        ...config,
        cache: { enabled: false, redirectPolicy: false },
      }),
    ).toMatch(/No model cache/);
  });
});
