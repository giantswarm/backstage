import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { GpuNode } from '../../lib/serving';
import type {
  ModelServingConfig,
  ServingPreset,
} from '../../lib/servingPresets';
import {
  cacheNotice,
  choiceForSeed,
  describeChoice,
  ServeModelDialog,
  serveModelChoices,
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

const modelPicker = () => screen.getByRole('button', { name: /Model/ });

async function chooseModel(label: string | RegExp) {
  await userEvent.click(modelPicker());
  await userEvent.click(screen.getByRole('option', { name: label }));
}

async function choosePresetForDownload(label: string) {
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
    expect(modelPicker()).toHaveTextContent(
      'Qwen3 14B · downloads from Hugging Face',
    );
    expect(
      screen.getByText(
        /Preset qwen3-14b · Qwen\/Qwen3-14B · 28 GiB of weights · 1 GPU/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Dense 14B general model.')).toBeInTheDocument();
    // The preset is derived from the model; no separate preset choice.
    expect(
      screen.queryByRole('button', { name: /Preset/ }),
    ).not.toBeInTheDocument();
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

  it('lays the form out as a flex column so a tall body scrolls and the footer stays reachable', () => {
    renderDialog();

    // bui's Dialog makes DialogBody the scrolling flex child; the form between
    // them has to pass that layout on, or the footer is clipped (#2228).
    const form = serveButton().closest('form');
    expect(form).toHaveStyle({ display: 'flex', flexDirection: 'column' });
    expect(form?.style.flexGrow).toBe('1');
    expect(['0', '0px']).toContain(form?.style.minHeight);
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

  it('re-seeds name and source when the model changes', async () => {
    renderDialog();

    await chooseModel('Nemotron 3 Super · downloads from Hugging Face');

    expect(nameField()).toHaveValue('nemotron');
    expect(sourceField()).toHaveValue('hf://nvidia/Nemotron');
  });

  it('blocks a preset that does not fit the node until acknowledged', async () => {
    renderDialog();

    await chooseModel('Nemotron 3 Super · downloads from Hugging Face');

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

  it('asks for hand-written network policies when the chart publishes none', () => {
    // No `networkPolicy` in the discovery document: a chart before 0.13.0,
    // or global.networkPolicy off.
    renderDialog();

    expect(screen.getByText('Before agents can use it')).toBeInTheDocument();
    const notice = screen.getByText(/renders no network policies/);
    expect(notice).toHaveTextContent(/reach the predictor in model-serving/);
    expect(notice).toHaveTextContent(/admission policies are off/);
    expect(
      screen.queryByText(/does not yet ship network policies/),
    ).not.toBeInTheDocument();
  });

  it('says the platform renders the network policies when the discovery document says so', () => {
    renderDialog({
      config: {
        ...config,
        networkPolicy: { enabled: true, flavor: 'cilium' },
      },
    });

    expect(screen.getByText('Network and cache')).toBeInTheDocument();
    const notice = screen.getByText(/renders the network policies/);
    expect(notice).toHaveTextContent(/model-serving \(cilium flavor\)/);
    expect(notice).toHaveTextContent(/additionalIngressNamespaces/);
    expect(notice).toHaveTextContent(/admission policies are off/);
    expect(
      screen.queryByText('Before agents can use it'),
    ).not.toBeInTheDocument();
  });

  it('treats a disabled networkPolicy field like an absent one', () => {
    renderDialog({
      config: { ...config, networkPolicy: { enabled: false } },
    });

    expect(screen.getByText('Before agents can use it')).toBeInTheDocument();
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
  /** Attributed by model-manager: the preset of the same name. */
  const nemotronDownload: DownloadedModelOption = {
    id: 'inst-1/kserve/cache/spark/nemotron',
    model: 'nvidia/Nemotron',
    node: 'spark',
    cachePath: 'nemotron',
    preset: 'nemotron',
    sizeBytes: 80 * GIB,
  };
  /** A directory model-manager could not attribute: bare name, no preset. */
  const glmDownload: DownloadedModelOption = {
    id: 'inst-1/kserve/cache/spark/glm-47-flash-awq4',
    model: 'glm-47-flash-awq4',
    node: 'spark',
    cachePath: 'glm-47-flash-awq4',
    sizeBytes: 40 * GIB,
  };

  it('lists presets with their cached weights, then the directories no preset claims', () => {
    const choices = serveModelChoices(
      [qwen, nemotron],
      [nemotronDownload, glmDownload],
    );

    expect(choices.map(describeChoice)).toEqual([
      'Qwen3 14B · downloads from Hugging Face',
      'Nemotron 3 Super · cached on spark',
      'glm-47-flash-awq4 · cached on spark · 40.0 GiB · no preset',
    ]);
  });

  it('matches a cache directory to its preset by repository when model-manager did not attribute it', () => {
    const unattributed = { ...nemotronDownload, preset: undefined };
    const choices = serveModelChoices([qwen, nemotron], [unattributed]);

    expect(choices.map(describeChoice)).toEqual([
      'Qwen3 14B · downloads from Hugging Face',
      'Nemotron 3 Super · cached on spark',
    ]);
    // model-manager's own attribution wins over the repository.
    expect(
      serveModelChoices(
        [qwen, nemotron],
        [{ ...nemotronDownload, preset: 'qwen3-14b' }],
      ).map(describeChoice),
    ).toEqual([
      'Qwen3 14B · cached on spark',
      'Nemotron 3 Super · downloads from Hugging Face',
    ]);
  });

  it('serves a preset from the cache when its weights are there: named after the directory, pinned to the node', async () => {
    renderDialog({ downloads: [nemotronDownload] });

    await chooseModel('Nemotron 3 Super · cached on spark');

    expect(
      screen.getByText(/served from the cache directory nemotron on spark/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Preset/ }),
    ).not.toBeInTheDocument();
    expect(nameField()).toHaveValue('nemotron');
    // No admission policy on this installation: serve the claim directly.
    expect(sourceField()).toHaveValue('pvc://hf-cache/nemotron');
    expect(
      screen.getByRole('button', { name: /Target node/ }),
    ).toHaveTextContent('spark');
  });

  it('starts from the download a row was served from, and a preset seed lands on its cached entry', () => {
    const { unmount } = renderDialog({
      downloads: [nemotronDownload],
      seed: { download: nemotronDownload },
    });

    expect(modelPicker()).toHaveTextContent(
      'Nemotron 3 Super · cached on spark',
    );
    expect(nameField()).toHaveValue('nemotron');
    expect(sourceField()).toHaveValue('pvc://hf-cache/nemotron');
    unmount();

    renderDialog({
      downloads: [nemotronDownload],
      seed: { presetName: 'nemotron' },
    });
    expect(modelPicker()).toHaveTextContent(
      'Nemotron 3 Super · cached on spark',
    );

    const choices = serveModelChoices([qwen, nemotron], [nemotronDownload]);
    expect(choiceForSeed(choices, { presetName: 'qwen3-14b' })?.id).toBe(
      'preset/qwen3-14b',
    );
    expect(choiceForSeed(choices, { download: glmDownload })).toBeUndefined();
    expect(choiceForSeed(choices, undefined)).toBeUndefined();
  });

  it('never lets a directory without a preset inherit the selected preset: it asks for one, warns, and wants that acknowledged', async () => {
    renderDialog({ downloads: [glmDownload] });

    // Qwen is selected; picking the unclaimed directory does not keep it.
    await chooseModel(/glm-47-flash-awq4 · cached on spark/);

    expect(
      screen.getByText(/repository that filled this directory is not recorded/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Preset/ }),
    ).not.toHaveTextContent('Qwen3 14B');
    expect(
      screen.queryByRole('textbox', { name: 'Name' }),
    ).not.toBeInTheDocument();
    expect(serveButton()).toBeDisabled();

    await choosePresetForDownload('Qwen3 14B');

    expect(
      screen.getByText('Preset written for another model'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Qwen3 14B was written for Qwen\/Qwen3-14B; these weights are glm-47-flash-awq4/,
      ),
    ).toBeInTheDocument();
    expect(nameField()).toHaveValue('glm-47-flash-awq4');
    // The directory's own weights, never the preset's hf:// source.
    expect(sourceField()).toHaveValue('pvc://hf-cache/glm-47-flash-awq4');
    expect(
      screen.getByRole('button', { name: /Target node/ }),
    ).toHaveTextContent('spark');

    await userEvent.click(serveButton());
    expect(onConfirm).not.toHaveBeenCalled();
    expect(
      screen.getByText(/written for another model — tick the acknowledgement/),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('checkbox', { name: /preset was not written/ }),
    );
    await userEvent.click(serveButton());

    expect(onConfirm).toHaveBeenCalledTimes(1);
    const { request, preset, manifest } = onConfirm.mock.calls[0][0];
    expect(preset.name).toBe('qwen3-14b');
    expect(request).toMatchObject({
      presetName: 'qwen3-14b',
      name: 'glm-47-flash-awq4',
      storageUri: 'pvc://hf-cache/glm-47-flash-awq4',
      node: 'spark',
      acknowledgePresetMismatch: true,
    });
    expect(manifest).toMatchObject({
      spec: {
        predictor: {
          model: { storageUri: 'pvc://hf-cache/glm-47-flash-awq4' },
        },
      },
    });
  });

  it("takes the directory's own source, never another model's", () => {
    const withPolicy = {
      ...config,
      cache: { ...config.cache, redirectPolicy: true },
    };
    // Repository known: the redirect policy finds the files under the
    // InferenceService's name, so the repository itself is the source.
    expect(storageUriForDownload(nemotronDownload, withPolicy)).toBe(
      'hf://nvidia/Nemotron',
    );
    expect(storageUriForDownload(nemotronDownload, config)).toBe(
      'pvc://hf-cache/nemotron',
    );
    expect(
      storageUriForDownload(nemotronDownload, {
        ...config,
        cache: { enabled: false, redirectPolicy: false },
      }),
    ).toBe('hf://nvidia/Nemotron');
    expect(
      storageUriForDownload(
        { ...nemotronDownload, cachePath: undefined },
        config,
      ),
    ).toBe('hf://nvidia/Nemotron');
    // Repository unknown: only the claim can serve it — under the redirect
    // policy too, where an hf:// source would download another model into
    // the directory.
    expect(storageUriForDownload(glmDownload, withPolicy)).toBe(
      'pvc://hf-cache/glm-47-flash-awq4',
    );
    expect(storageUriForDownload(glmDownload, config)).toBe(
      'pvc://hf-cache/glm-47-flash-awq4',
    );
    expect(
      storageUriForDownload(glmDownload, {
        ...config,
        cache: { enabled: false, redirectPolicy: false },
      }),
    ).toBe('');
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

describe('ServeModelDialog · nodes that are not serving targets', () => {
  /** A second GPU node the serving layer will not place a model on (model-manager 0.11 on). */
  const sparkE119: GpuNode = {
    ...spark,
    id: 'inst-1/spark-e119',
    name: 'spark-e119',
    eligible: false,
    eligibilityReason: 'cache claim hf-cache is pinned to spark',
  };

  it('seeds the one serving target and lists the other node disabled, with its reason', async () => {
    renderDialog({ gpuNodes: [spark, sparkE119] });

    // Two nodes listed, but one target: it is the default, not "Any node".
    expect(screen.getByText('Fits on spark')).toBeInTheDocument();
    expect(
      screen.getByText(/A node marked not a serving target cannot be picked/),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Target node/ }));
    const ineligible = screen.getByRole('option', { name: /spark-e119/ });
    expect(ineligible).toHaveAttribute('aria-disabled', 'true');
    expect(ineligible).toHaveTextContent('not a serving target');
    expect(ineligible).toHaveTextContent(
      'cache claim hf-cache is pinned to spark',
    );
    expect(
      screen.getByRole('option', { name: 'spark · NVIDIA-GB10' }),
    ).not.toHaveAttribute('aria-disabled');
  });

  it('leaves the target to the scheduler when the only listed node is not a serving target', () => {
    renderDialog({ gpuNodes: [sparkE119] });

    expect(
      screen.getByRole('button', { name: /Target node/ }),
    ).toHaveTextContent('Any node');
    expect(screen.getByText('Fit not checked')).toBeInTheDocument();
  });

  it('says nothing about serving targets when every node is one', () => {
    renderDialog({
      gpuNodes: [spark, { ...spark, id: 'inst-1/b', name: 'b' }],
    });

    expect(
      screen.queryByText(/A node marked not a serving target/),
    ).not.toBeInTheDocument();
  });
});
