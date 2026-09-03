import { crds } from '@giantswarm/k8s-types';
import { ModelConfig } from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  clientLookupOf,
  endpointAuthority,
  findServedModel,
  findServedModelForEndpoint,
  gpuFree,
  gpuTotal,
  hasServedModelActions,
  isSameServedModel,
  isServingFailure,
  mergeServingSnapshots,
  NO_SERVING_CAPABILITIES,
  notLoadedReadiness,
  overlayServedModel,
  predictorOfHostname,
  resolveClientServing,
  SERVED_MODEL_READINESS,
  SERVED_MODEL_READINESS_SEVERITY,
  servingShortcutFor,
  summarizeClientServing,
  type ClientServingState,
  type GpuNode,
  type ServedModel,
  type ServedModelReadiness,
  type ServingSourceSnapshot,
} from './serving';

const qwen: ServedModel = {
  id: 'alpha/kserve/kserve/qwen3-14b',
  installation: 'alpha',
  backend: 'kserve',
  name: 'qwen3-14b',
  namespace: 'kserve',
  readiness: 'ready',
  endpointHosts: [
    'qwen3-14b-predictor.kserve.svc.cluster.local',
    'qwen3-14b-predictor.kserve.svc',
    'qwen3-14b-predictor.kserve',
    'qwen3-14b.models.example.test',
  ],
};

describe('findServedModelForEndpoint', () => {
  it('matches a base URL by hostname regardless of scheme, port and path', () => {
    expect(
      findServedModelForEndpoint(
        'http://qwen3-14b-predictor.kserve.svc.cluster.local/v1',
        [qwen],
      ),
    ).toBe(qwen);
    expect(
      findServedModelForEndpoint(
        'HTTPS://Qwen3-14b.models.example.test:443/v1/',
        [qwen],
      ),
    ).toBe(qwen);
  });

  it('matches a model listed under an authority only from that port', () => {
    const ollamaOnly: ServedModel = {
      id: 'lab/ollama//qwen3:0.6b',
      installation: 'lab',
      backend: 'ollama',
      name: 'qwen3:0.6b',
      readiness: 'idle',
      endpointHosts: ['172.21.0.1:11434'],
    };
    expect(
      findServedModelForEndpoint('http://172.21.0.1:11434/v1', [ollamaOnly]),
    ).toBe(ollamaOnly);
    expect(
      findServedModelForEndpoint('http://172.21.0.1:13305/v1', [ollamaOnly]),
    ).toBeUndefined();
    expect(
      findServedModelForEndpoint('http://172.21.0.1/v1', [ollamaOnly]),
    ).toBeUndefined();
  });

  it('matches nothing for provider defaults, non-URLs and unknown hosts', () => {
    expect(findServedModelForEndpoint(undefined, [qwen])).toBeUndefined();
    expect(findServedModelForEndpoint('', [qwen])).toBeUndefined();
    expect(findServedModelForEndpoint('not-a-url', [qwen])).toBeUndefined();
    expect(
      findServedModelForEndpoint('https://api.openai.com/v1', [qwen]),
    ).toBeUndefined();
  });
});

describe('findServedModel', () => {
  // Two Ollama models on one host: the endpoint alone cannot tell them apart.
  const ollamaHost = ['172.21.0.1:11434'];
  const qwenSmall: ServedModel = {
    id: 'lab/ollama//qwen3:0.6b',
    installation: 'lab',
    backend: 'ollama',
    name: 'qwen3:0.6b',
    readiness: 'available',
    endpointHosts: ollamaHost,
    modelConfig: { name: 'qwen3-0-6b', namespace: 'kagent' },
  };
  const qwenBig: ServedModel = {
    id: 'lab/ollama//qwen3.5:9b',
    installation: 'lab',
    backend: 'ollama',
    name: 'qwen3.5:9b',
    readiness: 'ready',
    endpointHosts: ollamaHost,
  };

  it('prefers the ModelConfig the backend itself created', () => {
    expect(
      findServedModel(
        {
          // A ModelConfig model-manager wired: its host and model may say
          // anything, the reference is exact.
          endpoint: 'http://somewhere-else:11434',
          model: 'renamed',
          modelConfig: { name: 'qwen3-0-6b', namespace: 'kagent' },
        },
        [qwenBig, qwenSmall],
      ),
    ).toBe(qwenSmall);
  });

  it('disambiguates a shared host by the model id', () => {
    expect(
      findServedModel(
        { endpoint: 'http://172.21.0.1:11434/v1', model: 'qwen3.5:9b' },
        [qwenSmall, qwenBig],
      ),
    ).toBe(qwenBig);
    expect(
      findServedModel(
        { endpoint: 'http://172.21.0.1:11434', model: 'qwen3:0.6b' },
        [qwenSmall, qwenBig],
      ),
    ).toBe(qwenSmall);
  });

  it('matches nothing on a shared host when no served model carries the asked-for name', () => {
    expect(
      findServedModel(
        { endpoint: 'http://172.21.0.1:11434/v1', model: 'gemma3:270m' },
        [qwenSmall, qwenBig],
      ),
    ).toBeUndefined();
    expect(
      findServedModel({ endpoint: 'http://172.21.0.1:11434/v1' }, [
        qwenSmall,
        qwenBig,
      ]),
    ).toBeUndefined();
  });

  it('accepts the single model on a host whatever the client calls it', () => {
    // A vLLM InferenceService: the served-model name is the InferenceService,
    // the ModelConfig's model id is whatever vLLM was told to answer as.
    expect(
      findServedModel(
        {
          endpoint: 'http://qwen3-14b-predictor.kserve.svc.cluster.local/v1',
          model: 'qwen3-8-27b',
        },
        [qwen],
      ),
    ).toBe(qwen);
  });

  it('leaves a client of another server on the same machine alone, even with a single model on the host', () => {
    // The lab host runs a Lemonade server on :13305 next to Ollama on :11434.
    // With only one Ollama model present, the single-candidate rule must not
    // hand the Lemonade client to it: the port says it is another server.
    const lemonade = {
      endpoint: 'http://172.21.0.1:13305/v1',
      model: 'qwen3-it-4b-FLM',
    };
    expect(findServedModel(lemonade, [qwenSmall])).toBeUndefined();
    expect(findServedModel(lemonade, [qwenSmall, qwenBig])).toBeUndefined();
    // Ollama's own port, with one model there: the single-candidate rule
    // applies as before — on that server.
    expect(
      findServedModel(
        { endpoint: 'http://172.21.0.1:11434/v1', model: 'qwen3:0.6b' },
        [qwenSmall],
      ),
    ).toBe(qwenSmall);
    expect(
      findServedModel({ endpoint: 'http://172.21.0.1:11434' }, [qwenSmall]),
    ).toBe(qwenSmall);
  });

  it('needs a name match on a server declared multi-model, however few models are listed', () => {
    // One Ollama model left on the host: a ModelConfig asking for another
    // tag fronts nothing (Ollama would 404 it), not the one that is there.
    const shared = { sharedHosts: ['172.21.0.1:11434'] };
    expect(
      findServedModel(
        { endpoint: 'http://172.21.0.1:11434', model: 'gemma3:270m' },
        [qwenSmall],
        shared,
      ),
    ).toBeUndefined();
    expect(
      findServedModel(
        { endpoint: 'http://172.21.0.1:11434' },
        [qwenSmall],
        shared,
      ),
    ).toBeUndefined();
    expect(
      findServedModel(
        { endpoint: 'http://172.21.0.1:11434/v1', model: 'qwen3:0.6b' },
        [qwenSmall],
        shared,
      ),
    ).toBe(qwenSmall);
    // A single-model server nobody declared shared keeps the rule.
    expect(
      findServedModel(
        { endpoint: 'http://172.21.0.1:11434', model: 'gemma3:270m' },
        [qwenSmall],
        { sharedHosts: ['other.example:11434'] },
      ),
    ).toBe(qwenSmall);
  });

  it('fills in the scheme default port for a client without one', () => {
    const onDefaultPort: ServedModel = {
      ...qwenSmall,
      endpointHosts: ['ollama.example:80'],
    };
    expect(
      findServedModel({ endpoint: 'http://ollama.example/v1' }, [
        onDefaultPort,
      ]),
    ).toBe(onDefaultPort);
    expect(
      findServedModel({ endpoint: 'http://ollama.example:80/v1' }, [
        onDefaultPort,
      ]),
    ).toBe(onDefaultPort);
    // https is :443 — a TLS terminator in front, not the backend's own server
    // as the source declared it.
    expect(
      findServedModel({ endpoint: 'https://ollama.example/v1' }, [
        onDefaultPort,
      ]),
    ).toBeUndefined();
    expect(
      findServedModel({ endpoint: 'http://ollama.example:11434/v1' }, [
        onDefaultPort,
      ]),
    ).toBeUndefined();
  });

  it('matches a KServe predictor by hostname in every form, on any port and scheme', () => {
    for (const endpoint of [
      'http://qwen3-14b-predictor.kserve.svc.cluster.local/v1',
      'https://qwen3-14b-predictor.kserve.svc.cluster.local/v1',
      'http://qwen3-14b-predictor.kserve.svc.cluster.local:80',
      'http://qwen3-14b-predictor.kserve.svc:8080/v1',
      'http://qwen3-14b-predictor.kserve/v1',
      'https://qwen3-14b.models.example.test/v1',
    ]) {
      expect(findServedModel({ endpoint, model: 'anything' }, [qwen])).toBe(
        qwen,
      );
    }
    expect(
      findServedModel(
        { endpoint: 'http://other-predictor.kserve.svc.cluster.local/v1' },
        [qwen],
      ),
    ).toBeUndefined();
  });

  it('matches nothing for provider defaults and non-URLs', () => {
    expect(findServedModel({}, [qwen])).toBeUndefined();
    expect(findServedModel({ endpoint: '' }, [qwen])).toBeUndefined();
    expect(findServedModel({ model: 'qwen3-14b' }, [qwen])).toBeUndefined();
  });
});

describe('hasServedModelActions', () => {
  it('is true only when an operation beyond listing is offered', () => {
    expect(hasServedModelActions(undefined)).toBe(false);
    expect(hasServedModelActions(NO_SERVING_CAPABILITIES)).toBe(false);
    expect(
      hasServedModelActions({
        ...NO_SERVING_CAPABILITIES,
        nodeInventory: true,
      }),
    ).toBe(false);
    expect(
      hasServedModelActions({ ...NO_SERVING_CAPABILITIES, load: true }),
    ).toBe(true);
    expect(
      hasServedModelActions({ ...NO_SERVING_CAPABILITIES, delete: true }),
    ).toBe(true);
  });
});

describe('gpuTotal / gpuFree', () => {
  const base: GpuNode = {
    id: 'alpha/gpu-node-1',
    installation: 'alpha',
    name: 'gpu-node-1',
    ready: true,
  };

  it('prefers device-plugin capacity over the discovery label', () => {
    expect(gpuTotal({ ...base, capacity: 2, labeledCount: 1 })).toBe(2);
    expect(gpuTotal({ ...base, labeledCount: 1 })).toBe(1);
    expect(gpuTotal(base)).toBeUndefined();
  });

  it('subtracts requests from allocatable, never below zero', () => {
    expect(gpuFree({ ...base, allocatable: 2, requested: 1 })).toBe(1);
    expect(gpuFree({ ...base, allocatable: 1, requested: 3 })).toBe(0);
  });

  it('is unknown without device-plugin data or without pod data', () => {
    expect(gpuFree({ ...base, labeledCount: 1, requested: 0 })).toBeUndefined();
    expect(gpuFree({ ...base, allocatable: 1 })).toBeUndefined();
  });
});

describe('mergeServingSnapshots', () => {
  const kserve: ServingSourceSnapshot = {
    isLoading: false,
    installations: ['alpha'],
    backends: { alpha: 'kserve' },
    unreachableInstallations: ['gaggle'],
    servedModels: [qwen],
    gpuNodes: [
      {
        id: 'alpha/gpu-node-1',
        installation: 'alpha',
        name: 'gpu-node-1',
        ready: true,
      },
    ],
    gpuCapacityUnavailable: { beta: 'forbidden' },
  };
  const ollama: ServingSourceSnapshot = {
    isLoading: true,
    installations: ['lab'],
    backends: { lab: 'ollama' },
    unreachableInstallations: ['gaggle'],
    servedModels: [],
    gpuNodes: [],
    gpuCapacityUnavailable: {},
  };

  it('unions installations, models and nodes, and de-duplicates unreachable', () => {
    const merged = mergeServingSnapshots([kserve, ollama]);

    expect(merged.installations).toEqual(['alpha', 'lab']);
    expect(merged.backends).toEqual({ alpha: 'kserve', lab: 'ollama' });
    expect(merged.unreachableInstallations).toEqual(['gaggle']);
    expect(merged.servedModels).toEqual([qwen]);
    expect(merged.gpuNodes).toHaveLength(1);
    expect(merged.gpuCapacityUnavailable).toEqual({ beta: 'forbidden' });
    expect(merged.isLoading).toBe(true);
  });

  it('lets a later source override an installation an earlier one claimed', () => {
    const merged = mergeServingSnapshots([
      kserve,
      { ...ollama, installations: ['alpha'], backends: { alpha: 'ollama' } },
    ]);

    expect(merged.backends).toEqual({ alpha: 'ollama' });
  });

  it('ORs the capabilities of sources sharing an installation', () => {
    const merged = mergeServingSnapshots([
      {
        ...kserve,
        capabilities: {
          alpha: { ...NO_SERVING_CAPABILITIES, nodeInventory: true },
        },
      },
      {
        ...ollama,
        installations: ['alpha'],
        backends: { alpha: 'ollama' },
        capabilities: {
          alpha: { ...NO_SERVING_CAPABILITIES, pull: true, load: true },
        },
      },
    ]);

    expect(merged.capabilities).toEqual({
      alpha: {
        ...NO_SERVING_CAPABILITIES,
        nodeInventory: true,
        pull: true,
        load: true,
      },
    });
  });

  it('tolerates sources without capabilities', () => {
    expect(mergeServingSnapshots([kserve, ollama]).capabilities).toEqual({});
  });

  describe('folding two views of one served model', () => {
    // model-manager's view of the same InferenceService: named the same,
    // answering on the predictor host, carrying what the CR read lacks.
    const qwenFromManager: ServedModel = {
      id: 'alpha/kserve/kserve/qwen3-14b',
      installation: 'alpha',
      backend: 'kserve',
      name: 'qwen3-14b',
      namespace: 'kserve',
      readiness: 'pending',
      readinessMessage: 'InferenceService qwen3-14b has not reported yet.',
      endpointHosts: ['qwen3-14b-predictor.kserve.svc.cluster.local'],
      managerRef: 'Qwen/Qwen3-14B',
      sizeBytes: 29_540_000_000,
      downloaded: true,
      cachePath: 'qwen3-14b',
      loaded: true,
      modelConfig: { name: 'qwen3-14b', namespace: 'kagent', managed: false },
      operable: true,
    };
    const cached: ServedModel = {
      id: 'alpha/kserve/cache/gpu-node-1/devstral',
      installation: 'alpha',
      backend: 'kserve',
      name: 'mistralai/Devstral',
      readiness: 'available',
      endpointHosts: [],
      managerRef: 'mistralai/Devstral',
      downloaded: true,
      node: 'gpu-node-1',
      operable: true,
    };
    const manager: ServingSourceSnapshot = {
      ...ollama,
      isLoading: false,
      installations: ['alpha'],
      backends: { alpha: 'kserve' },
      unreachableInstallations: [],
      servedModels: [qwenFromManager, cached],
    };

    it('recognises the same predictor by hostname, never rows without one', () => {
      expect(isSameServedModel(qwen, qwenFromManager)).toBe(true);
      expect(isSameServedModel(qwen, cached)).toBe(false);
      expect(
        isSameServedModel(qwen, { ...qwenFromManager, installation: 'beta' }),
      ).toBe(false);
    });

    it("keeps the CR's identity and status and takes the manager's inventory and controls", () => {
      const merged = overlayServedModel(qwen, qwenFromManager);

      expect(merged).toMatchObject({
        id: qwen.id,
        name: 'qwen3-14b',
        readiness: 'ready',
        managerRef: 'Qwen/Qwen3-14B',
        sizeBytes: 29_540_000_000,
        downloaded: true,
        cachePath: 'qwen3-14b',
        loaded: true,
        modelConfig: { name: 'qwen3-14b', namespace: 'kagent', managed: false },
        operable: true,
      });
      // The explanation belongs to the status: the CR's (none) stays.
      expect(merged.readinessMessage).toBeUndefined();
      expect(merged.endpointHosts).toEqual(
        expect.arrayContaining([
          ...qwen.endpointHosts,
          'qwen3-14b-predictor.kserve.svc.cluster.local',
        ]),
      );
    });

    it('folds a later source onto an earlier one and lists the rest side by side', () => {
      const merged = mergeServingSnapshots([kserve, manager]);

      expect(merged.servedModels.map(model => model.id)).toEqual([
        qwen.id,
        cached.id,
      ]);
      expect(merged.servedModels[0]).toMatchObject({
        readiness: 'ready',
        operable: true,
        managerRef: 'Qwen/Qwen3-14B',
      });
    });

    it('never folds rows of one source into each other, whatever hosts they share', () => {
      // Every Ollama tag answers on the same host; they are different models.
      const tags: ServedModel[] = ['qwen3:0.6b', 'gemma3:270m'].map(name => ({
        id: `lab/ollama//${name}`,
        installation: 'lab',
        backend: 'ollama',
        name,
        readiness: 'available',
        endpointHosts: ['172.21.0.1'],
      }));
      const merged = mergeServingSnapshots([
        kserve,
        { ...ollama, servedModels: tags },
      ]);

      expect(merged.servedModels).toHaveLength(3);
    });

    it('merges GPU nodes by id, the later figures filling in the earlier', () => {
      const merged = mergeServingSnapshots([
        kserve,
        {
          ...manager,
          servedModels: [],
          gpuNodes: [
            {
              id: 'alpha/gpu-node-1',
              installation: 'alpha',
              name: 'gpu-node-1',
              ready: true,
              memoryBudgetBytes: 100,
              memoryFreeBytes: 40,
              cache: { models: 2, bytesUsed: 60 },
            },
          ],
        },
      ]);

      expect(merged.gpuNodes).toEqual([
        {
          id: 'alpha/gpu-node-1',
          installation: 'alpha',
          name: 'gpu-node-1',
          ready: true,
          memoryBudgetBytes: 100,
          memoryFreeBytes: 40,
          cache: { models: 2, bytesUsed: 60 },
        },
      ]);
    });
  });

  it('is empty and settled with no sources', () => {
    expect(mergeServingSnapshots([])).toEqual({
      isLoading: false,
      installations: [],
      backends: {},
      sourceBackends: {},
      capabilities: {},
      loading: {},
      sharedHosts: {},
      unreachableInstallations: [],
      servedModels: [],
      gpuNodes: [],
      gpuCapacityUnavailable: {},
    });
  });
});

// --- The readiness vocabulary -------------------------------------------------

const EVERY_READINESS: ServedModelReadiness[] = [
  'ready',
  'idle',
  'notServing',
  'available',
  'downloading',
  'notReady',
  'pending',
];

describe('SERVED_MODEL_READINESS', () => {
  it('names every state, with Not serving the only warning', () => {
    for (const readiness of EVERY_READINESS) {
      expect(SERVED_MODEL_READINESS[readiness].label).toBeTruthy();
      expect(SERVED_MODEL_READINESS[readiness].phrase).toBeTruthy();
      expect(SERVED_MODEL_READINESS[readiness].description).toBeTruthy();
    }
    expect(SERVED_MODEL_READINESS.idle).toMatchObject({
      label: 'Idle',
      intent: 'neutral',
      phrase: 'idle — loads on first request',
    });
    expect(SERVED_MODEL_READINESS.notServing).toMatchObject({
      label: 'Not serving',
      intent: 'warning',
    });
    expect(
      EVERY_READINESS.filter(
        readiness => SERVED_MODEL_READINESS[readiness].intent === 'warning',
      ),
    ).toEqual(['notServing']);
    expect(SERVED_MODEL_READINESS.ready.intent).toBe('positive');
    expect(SERVED_MODEL_READINESS.notReady.intent).toBe('negative');
    expect(SERVED_MODEL_READINESS.available.label).toBe('Available');
  });

  it('ranks the states that need attention first', () => {
    const sorted = [...EVERY_READINESS].sort(
      (a, b) =>
        SERVED_MODEL_READINESS_SEVERITY[a] - SERVED_MODEL_READINESS_SEVERITY[b],
    );
    expect(sorted[0]).toBe('notServing');
    expect(sorted[sorted.length - 1]).toBe('ready');
  });

  it('counts only Not serving and Not ready as failures an agent would hit', () => {
    expect(EVERY_READINESS.filter(isServingFailure)).toEqual([
      'notServing',
      'notReady',
    ]);
  });
});

describe('notLoadedReadiness', () => {
  it('is Idle on a backend that loads on demand, whether or not a client points at the model', () => {
    const ollama = { onDemand: true, idleEviction: true };
    expect(notLoadedReadiness(ollama)).toBe('idle');
    expect(notLoadedReadiness(ollama, { hasClient: true })).toBe('idle');
  });

  it('is Not serving only when the backend does not load on demand and a client points at the model', () => {
    const kserve = { onDemand: false, idleEviction: false };
    expect(notLoadedReadiness(kserve, { hasClient: true })).toBe('notServing');
    expect(notLoadedReadiness(kserve)).toBe('available');
  });

  it('stays Available when the backend says nothing about loading', () => {
    expect(notLoadedReadiness(undefined)).toBe('available');
    expect(notLoadedReadiness(undefined, { hasClient: true })).toBe(
      'available',
    );
  });
});

describe('endpointAuthority', () => {
  it('names the server, not just the machine, with the scheme default filled in', () => {
    expect(endpointAuthority('http://172.21.0.1:11434')).toBe(
      '172.21.0.1:11434',
    );
    expect(endpointAuthority('http://172.21.0.1:11434/v1')).toBe(
      '172.21.0.1:11434',
    );
    expect(endpointAuthority('http://172.21.0.1:13305/v1')).toBe(
      '172.21.0.1:13305',
    );
    expect(endpointAuthority('HTTPS://Models.Example/v1')).toBe(
      'models.example:443',
    );
    expect(
      endpointAuthority('http://x-predictor.ns.svc.cluster.local/v1'),
    ).toBe('x-predictor.ns.svc.cluster.local:80');
  });

  it('answers nothing for provider defaults and non-URLs', () => {
    expect(endpointAuthority(undefined)).toBeUndefined();
    expect(endpointAuthority('')).toBeUndefined();
    expect(endpointAuthority('not-a-url')).toBeUndefined();
  });
});

describe('predictorOfHostname', () => {
  it('reads the InferenceService and namespace out of a predictor host in every form KServe gives it', () => {
    const expected = { name: 'lab-echo', namespace: 'model-serving' };
    expect(
      predictorOfHostname('lab-echo-predictor.model-serving.svc.cluster.local'),
    ).toEqual(expected);
    expect(predictorOfHostname('lab-echo-predictor.model-serving.svc')).toEqual(
      expected,
    );
    expect(predictorOfHostname('lab-echo-predictor.model-serving')).toEqual(
      expected,
    );
  });

  it('answers nothing for hosts that are not predictors', () => {
    expect(predictorOfHostname(undefined)).toBeUndefined();
    expect(predictorOfHostname('172.21.0.1')).toBeUndefined();
    expect(predictorOfHostname('api.openai.com')).toBeUndefined();
    expect(predictorOfHostname('lab-echo.model-serving.svc')).toBeUndefined();
  });
});

describe('resolveClientServing', () => {
  const ollamaHost = ['172.21.0.1:11434'];
  const qwenSmall: ServedModel = {
    id: 'lab/ollama//qwen3:0.6b',
    installation: 'lab',
    backend: 'ollama',
    name: 'qwen3:0.6b',
    readiness: 'idle',
    readinessMessage: 'Downloaded; not loaded.',
    endpointHosts: ollamaHost,
    loaded: false,
    managerRef: 'qwen3:0.6b',
    operable: true,
  };
  const qwenBig: ServedModel = {
    id: 'lab/ollama//qwen3.5:9b',
    installation: 'lab',
    backend: 'ollama',
    name: 'qwen3.5:9b',
    readiness: 'ready',
    endpointHosts: ollamaHost,
    loaded: true,
    operable: true,
  };
  const lab = {
    installation: 'lab',
    candidates: [qwenSmall, qwenBig],
    backends: ['ollama' as const],
    sharedHosts: ['172.21.0.1:11434'],
  };

  it('takes the readiness, name and words of the served model a client fronts', () => {
    expect(
      resolveClientServing(
        { endpoint: 'http://172.21.0.1:11434', model: 'qwen3:0.6b' },
        lab,
      ),
    ).toEqual({
      installation: 'lab',
      backend: 'ollama',
      readiness: 'idle',
      name: 'qwen3:0.6b',
      namespace: undefined,
      message: 'Downloaded; not loaded.',
      model: qwenSmall,
    });
  });

  it('falls back to the vocabulary when the backend gives no reason', () => {
    expect(
      resolveClientServing(
        { endpoint: 'http://172.21.0.1:11434', model: 'qwen3.5:9b' },
        lab,
      )?.message,
    ).toBe(SERVED_MODEL_READINESS.ready.description);
  });

  it('reports a model gone from a shared host as Not serving, named after what the client asks for', () => {
    const state = resolveClientServing(
      { endpoint: 'http://172.21.0.1:11434', model: 'qwen2.5:0.5b' },
      lab,
    );
    expect(state).toMatchObject({
      installation: 'lab',
      backend: 'ollama',
      readiness: 'notServing',
      name: 'qwen2.5:0.5b',
    });
    expect(state?.model).toBeUndefined();
    expect(state?.message).toMatch(/deleted, or never pulled/);
  });

  it('does not guess a shared host from the rows: only what the source declared counts', () => {
    expect(
      resolveClientServing(
        { endpoint: 'http://172.21.0.1:11434', model: 'gone:1b' },
        { ...lab, sharedHosts: [] },
      ),
    ).toBeUndefined();
  });

  it('tells another server on the same machine apart from the backend by its port', () => {
    // The lab host runs a Lemonade server on :13305 next to Ollama on :11434
    // — its clients are not Ollama's, and its models are not "gone".
    expect(
      resolveClientServing(
        { endpoint: 'http://172.21.0.1:13305/v1', model: 'qwen3-it-4b-FLM' },
        lab,
      ),
    ).toBeUndefined();
    // The OpenAI-compatible path on Ollama's own port is Ollama's.
    expect(
      resolveClientServing(
        { endpoint: 'http://172.21.0.1:11434/v1', model: 'gone:1b' },
        lab,
      )?.readiness,
    ).toBe('notServing');
  });

  it('does not hand a client of the other server to the single Ollama model', () => {
    // One Ollama model on the host: the positive match's single-candidate
    // rule must not claim the Lemonade client, and the negative match must
    // not call its model gone — no verdict at all.
    const oneModel = { ...lab, candidates: [qwenSmall] };
    expect(
      resolveClientServing(
        { endpoint: 'http://172.21.0.1:13305/v1', model: 'qwen3-it-4b-FLM' },
        oneModel,
      ),
    ).toBeUndefined();
    expect(
      resolveClientServing(
        { endpoint: 'http://172.21.0.1:11434', model: 'qwen3:0.6b' },
        oneModel,
      )?.model,
    ).toBe(qwenSmall);
    // Nor an Ollama client asking for a tag that is not there: gone, not
    // "served by" the one model left.
    const gone = resolveClientServing(
      { endpoint: 'http://172.21.0.1:11434', model: 'gemma3:270m' },
      oneModel,
    );
    expect(gone).toMatchObject({
      backend: 'ollama',
      readiness: 'notServing',
      name: 'gemma3:270m',
    });
    expect(gone?.model).toBeUndefined();
  });

  it('reports a KServe predictor nobody serves as Not serving, named after the InferenceService', () => {
    const state = resolveClientServing(
      {
        endpoint:
          'http://lab-echo-predictor.model-serving.svc.cluster.local/v1',
        model: 'lab-echo',
      },
      {
        installation: 'gpu',
        candidates: [],
        backends: ['kserve'],
        sharedHosts: [],
      },
    );
    expect(state).toMatchObject({
      installation: 'gpu',
      backend: 'kserve',
      readiness: 'notServing',
      name: 'lab-echo',
      namespace: 'model-serving',
    });
    expect(state?.message).toMatch(/stopped, or never created/);
  });

  it('ignores a predictor-shaped host on an installation without a KServe backend', () => {
    expect(
      resolveClientServing(
        {
          endpoint: 'http://x-predictor.ns.svc.cluster.local/v1',
          model: 'x',
        },
        lab,
      ),
    ).toBeUndefined();
  });

  it('says nothing about provider defaults and external endpoints', () => {
    expect(resolveClientServing({}, lab)).toBeUndefined();
    expect(
      resolveClientServing(
        { endpoint: 'https://api.openai.com/v1', model: 'gpt-5' },
        lab,
      ),
    ).toBeUndefined();
  });

  it('drops the row when summarised for a table', () => {
    const state = resolveClientServing(
      { endpoint: 'http://172.21.0.1:11434', model: 'qwen3:0.6b' },
      lab,
    ) as ClientServingState;
    expect(summarizeClientServing(state)).toEqual({
      installation: 'lab',
      backend: 'ollama',
      readiness: 'idle',
      name: 'qwen3:0.6b',
      namespace: undefined,
      message: 'Downloaded; not loaded.',
    });
  });

  describe('servingShortcutFor', () => {
    const canLoadAndPull = {
      ...NO_SERVING_CAPABILITIES,
      load: true,
      pull: true,
    };

    it('offers Load for an idle, operable model on a backend that can load', () => {
      const state = resolveClientServing(
        { endpoint: 'http://172.21.0.1:11434', model: 'qwen3:0.6b' },
        lab,
      ) as ClientServingState;
      expect(servingShortcutFor(state, canLoadAndPull)).toEqual({
        kind: 'load',
        ref: 'qwen3:0.6b',
      });
      expect(
        servingShortcutFor(state, NO_SERVING_CAPABILITIES),
      ).toBeUndefined();
    });

    it('offers nothing for a model that is running', () => {
      const state = resolveClientServing(
        { endpoint: 'http://172.21.0.1:11434', model: 'qwen3.5:9b' },
        lab,
      ) as ClientServingState;
      expect(servingShortcutFor(state, canLoadAndPull)).toBeUndefined();
    });

    it('offers Pull for a model gone from a host that pulls by reference', () => {
      const state = resolveClientServing(
        { endpoint: 'http://172.21.0.1:11434', model: 'qwen2.5:0.5b' },
        lab,
      ) as ClientServingState;
      expect(servingShortcutFor(state, canLoadAndPull)).toEqual({
        kind: 'pull',
        ref: 'qwen2.5:0.5b',
      });
      expect(
        servingShortcutFor(state, { ...NO_SERVING_CAPABILITIES, load: true }),
      ).toBeUndefined();
    });

    it('offers the backend load for a gone InferenceService, and nothing without it', () => {
      const state = resolveClientServing(
        {
          endpoint: 'http://lab-echo-predictor.model-serving.svc/v1',
          model: 'lab-echo',
        },
        {
          installation: 'gpu',
          candidates: [],
          backends: ['kserve'],
          sharedHosts: [],
        },
      ) as ClientServingState;
      expect(servingShortcutFor(state, canLoadAndPull, 'kserve')).toEqual({
        kind: 'load',
        ref: 'lab-echo',
      });
      expect(
        servingShortcutFor(
          state,
          { ...NO_SERVING_CAPABILITIES, pull: true },
          'kserve',
        ),
      ).toBeUndefined();
      // The `load` flag of an Ollama model-manager on the same installation
      // (its CRs read beside it) cannot bring an InferenceService back.
      expect(
        servingShortcutFor(state, canLoadAndPull, 'ollama'),
      ).toBeUndefined();
      expect(servingShortcutFor(state, canLoadAndPull)).toBeUndefined();
    });
  });
});

describe('mergeServingSnapshots: loading and shared hosts', () => {
  const empty: ServingSourceSnapshot = {
    isLoading: false,
    installations: [],
    backends: {},
    unreachableInstallations: [],
    servedModels: [],
    gpuNodes: [],
    gpuCapacityUnavailable: {},
  };

  it('keeps every source’s backend while the later one labels the installation', () => {
    const merged = mergeServingSnapshots([
      { ...empty, installations: ['lab'], backends: { lab: 'kserve' } },
      { ...empty, installations: ['lab'], backends: { lab: 'ollama' } },
    ]);
    expect(merged.backends).toEqual({ lab: 'ollama' });
    expect(merged.sourceBackends).toEqual({ lab: ['kserve', 'ollama'] });
  });

  it('lets the later source have the last word on loading and unions the hosts', () => {
    const merged = mergeServingSnapshots([
      {
        ...empty,
        installations: ['lab'],
        backends: { lab: 'kserve' },
        loading: { lab: { onDemand: false, idleEviction: false } },
        sharedHosts: { lab: ['a.example:443'] },
      },
      {
        ...empty,
        installations: ['lab'],
        backends: { lab: 'ollama' },
        loading: { lab: { onDemand: true, idleEviction: true } },
        sharedHosts: { lab: ['172.21.0.1:11434', 'a.example:443'] },
      },
    ]);
    expect(merged.loading).toEqual({
      lab: { onDemand: true, idleEviction: true },
    });
    expect(merged.sharedHosts).toEqual({
      lab: ['a.example:443', '172.21.0.1:11434'],
    });
  });

  it('answers empty maps when no source reports either', () => {
    const merged = mergeServingSnapshots([empty]);
    expect(merged.loading).toEqual({});
    expect(merged.sharedHosts).toEqual({});
  });
});

describe('clientLookupOf', () => {
  it('reads the endpoint, model and identity off a ModelConfig', () => {
    const modelConfig = new ModelConfig(
      {
        apiVersion: 'kagent.dev/v1alpha2',
        kind: 'ModelConfig',
        metadata: { name: 'qwen3-0-6b', namespace: 'kagent' },
        spec: {
          provider: 'Ollama',
          model: 'qwen3:0.6b',
          ollama: { host: 'http://172.21.0.1:11434' },
        },
      } as crds.kagent.v1alpha2.ModelConfig,
      'lab',
    );
    expect(clientLookupOf(modelConfig)).toEqual({
      endpoint: 'http://172.21.0.1:11434',
      model: 'qwen3:0.6b',
      modelConfig: { name: 'qwen3-0-6b', namespace: 'kagent' },
    });
  });
});
