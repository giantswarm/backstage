import {
  ClusterManagerError,
  ClusterManagerNotConnectedError,
  cheapestPriced,
  classifyClusterManagerError,
  clusterManagerToolName,
  describeComponent,
  describePrice,
  describePriceSources,
  groupManifestsByRelease,
  isValidPoolName,
  manifestFilename,
  parseRefusal,
  poolNameOf,
  presetLabel,
} from './clusterManager';

describe('clusterManagerToolName', () => {
  it('prefixes every tool with the muster server prefix', () => {
    expect(clusterManagerToolName('create_node_pool')).toBe(
      'x_cluster-manager_create_node_pool',
    );
    expect(clusterManagerToolName('get_info')).toBe(
      'x_cluster-manager_get_info',
    );
  });
});

describe('isValidPoolName', () => {
  it("accepts the chart's pattern: five to twenty of [a-z0-9-]", () => {
    expect(isValidPoolName('gpu00')).toBe(true);
    expect(isValidPoolName('gpu-l4')).toBe(true);
    expect(isValidPoolName('a'.repeat(20))).toBe(true);
  });
  it('rejects too short, too long, uppercase and a dash at either end', () => {
    expect(isValidPoolName('gpu')).toBe(false);
    expect(isValidPoolName('a'.repeat(21))).toBe(false);
    expect(isValidPoolName('GPU-l4')).toBe(false);
    expect(isValidPoolName('-gpu00')).toBe(false);
    expect(isValidPoolName('gpu00-')).toBe(false);
  });
});

describe('parseRefusal', () => {
  const block = {
    refused: {
      nodes: ['aws:///eu-west-1a/i-0abc'],
      models: ['LLMInferenceService model-serving/qwen3-4b (Qwen/Qwen3-4B)'],
      hint: 'Karpenter removes an empty node about 10 minutes after its last pod; a served model has to be unloaded first.',
    },
  };
  it('reads the refused block from the further text blocks', () => {
    expect(parseRefusal(['not json', JSON.stringify(block)])).toEqual(
      block.refused,
    );
  });
  it('tolerates a block with fields missing', () => {
    expect(parseRefusal(['{"refused":{"nodes":["i-1"]}}'])).toEqual({
      nodes: ['i-1'],
      models: [],
      hint: '',
    });
  });
  it('is undefined without a refused block', () => {
    expect(parseRefusal([])).toBeUndefined();
    expect(parseRefusal(['{"partial":true}'])).toBeUndefined();
  });

  it("carries create_node_pool's cache blocks: the zones named against a claim, or several claims", () => {
    const claim = {
      namespace: 'model-serving',
      name: 'hf-cache',
      phase: 'Bound',
      volume: 'pvc-1',
      zone: 'eu-central-1b',
    };
    expect(
      parseRefusal([
        JSON.stringify({
          refused: {
            nodes: [],
            models: [],
            hint: "Name the claim's zone among the zones, name one zone, or pass cache false, and re-run.",
            cacheZone: {
              claim,
              claimZone: 'eu-central-1b',
              zones: ['eu-central-1a', 'eu-central-1c'],
              remedies: [
                'name eu-central-1b among the zones',
                'pass cache false',
              ],
            },
          },
        }),
      ]),
    ).toEqual({
      nodes: [],
      models: [],
      hint: "Name the claim's zone among the zones, name one zone, or pass cache false, and re-run.",
      cacheZone: {
        claim: { ...claim, error: undefined },
        claimZone: 'eu-central-1b',
        zones: ['eu-central-1a', 'eu-central-1c'],
        remedies: ['name eu-central-1b among the zones', 'pass cache false'],
      },
    });
    const several = parseRefusal([
      JSON.stringify({
        refused: {
          nodes: [],
          models: [],
          hint: '',
          cacheClaims: {
            claims: [
              claim,
              {
                ...claim,
                name: 'hf-cache-eu-central-1a',
                zone: 'eu-central-1a',
              },
            ],
            remedies: ['name one zone'],
          },
        },
      }),
    ]);
    expect(several?.cacheClaims?.claims.map(c => c.name)).toEqual([
      'hf-cache',
      'hf-cache-eu-central-1a',
    ]);
    expect(several?.cacheZone).toBeUndefined();
  });
});

describe('classifyClusterManagerError', () => {
  it('keeps the structured refusal a tool error carries as details', () => {
    const error = classifyClusterManagerError(
      Object.assign(new Error('node pool gpu-l4 still runs 1 node(s)'), {
        details: ['{"refused":{"nodes":["i-1"],"models":[],"hint":"wait"}}'],
      }),
    );
    expect(error).toBeInstanceOf(ClusterManagerError);
    expect((error as ClusterManagerError).refused).toEqual({
      nodes: ['i-1'],
      models: [],
      hint: 'wait',
    });
    expect(
      (classifyClusterManagerError(new Error('plain')) as ClusterManagerError)
        .refused,
    ).toBeUndefined();
  });

  it("turns muster's not-connected answers into the connect step", () => {
    expect(
      classifyClusterManagerError(
        new Error('tool not found: x_cluster-manager_get_info'),
      ),
    ).toBeInstanceOf(ClusterManagerNotConnectedError);
  });
  it('keeps every other message verbatim as a refusal', () => {
    const error = classifyClusterManagerError(
      new Error('node pool gpu-l4 still runs 1 node(s) (i-1): …'),
    );
    expect(error).toBeInstanceOf(ClusterManagerError);
    expect(error.message).toBe(
      'node pool gpu-l4 still runs 1 node(s) (i-1): …',
    );
  });
});

describe('groupManifestsByRelease', () => {
  const manifests = [
    { kind: 'OCIRepository', metadata: { name: 'wc1-gpu-l4' } },
    { kind: 'Secret', metadata: { name: 'wc1-gpu-l4-values' } },
    { kind: 'HelmRelease', metadata: { name: 'wc1-gpu-l4' } },
    { kind: 'OCIRepository', metadata: { name: 'wc1-gpu-operator' } },
    { kind: 'HelmRelease', metadata: { name: 'wc1-gpu-operator' } },
    { kind: 'ConfigMap', metadata: { name: 'model-backend-kserve' } },
  ];

  it('groups the dry run into the pool, the operator and the backend', () => {
    const groups = groupManifestsByRelease({
      cluster: 'wc1',
      pool: 'gpu-l4',
      manifests,
    });
    expect(
      groups.map(group => [group.role, group.name, group.manifests.length]),
    ).toEqual([
      ['pool', 'wc1-gpu-l4', 3],
      ['gpu-operator', 'wc1-gpu-operator', 2],
      ['backend', 'model-backend-kserve', 1],
    ]);
  });

  it('names the files <kind>-<name>.yaml', () => {
    expect(manifestFilename(manifests[1])).toBe(
      'secret-wc1-gpu-l4-values.yaml',
    );
  });
});

describe('poolNameOf', () => {
  it('strips the cluster prefix cluster-manager adds to the MachinePool', () => {
    expect(poolNameOf({ name: 'wc1-gpu-a10g' }, 'wc1')).toBe('gpu-a10g');
    expect(poolNameOf({ name: 'other' }, 'wc1')).toBe('other');
  });
});

describe('describeComponent', () => {
  it('names the provider, or the reason it is unknown', () => {
    expect(
      describeComponent(
        { status: 'present', provider: 'chart' },
        'GPU operator',
      ),
    ).toBe("GPU operator: the platform's release");
    expect(
      describeComponent({ status: 'present', provider: 'manual' }, 'Serving'),
    ).toBe('Serving: by hand');
    expect(describeComponent({ status: 'absent' }, 'Serving')).toBe(
      'Serving: absent',
    );
    expect(
      describeComponent({ status: 'unknown', reason: 'forbidden' }, 'Serving'),
    ).toBe('Serving: unknown (forbidden)');
  });
});

describe('prices and preset names (giantswarm/cluster-manager#44)', () => {
  const xlarge = {
    instanceType: 'g6.xlarge',
    size: 'xlarge',
    vcpu: 4,
    memoryGiB: 16,
    gpus: 1,
    gpuMemoryGiB: 24,
    usableVcpu: 3,
    usableMemoryGiB: 11.9,
    pricePerHourUSD: 1.0064,
    priceSource:
      'AWS EC2 on-demand Linux list price, EU (Frankfurt) (eu-central-1)',
    priceAsOf: '2026-09-17',
  };
  const twoXlarge = {
    ...xlarge,
    instanceType: 'g6.2xlarge',
    size: '2xlarge',
    pricePerHourUSD: 1.22249,
  };
  const unpriced = {
    ...xlarge,
    instanceType: 'g6.4xlarge',
    size: '4xlarge',
    pricePerHourUSD: undefined,
    priceSource: undefined,
    priceAsOf: undefined,
    priceNote: 'no on-demand price: the size is not offered there',
  };

  it('formats the price to two decimals per hour, and nothing without one', () => {
    expect(describePrice(xlarge)).toBe('$1.01/h');
    expect(describePrice(twoXlarge)).toBe('$1.22/h');
    expect(describePrice({ pricePerHourUSD: 2 })).toBe('$2.00/h');
    expect(describePrice(unpriced)).toBeUndefined();
  });

  it('names the cheapest of the chosen sizes that carries a price', () => {
    const shapes = [xlarge, twoXlarge, unpriced];
    expect(cheapestPriced(shapes, ['xlarge', '2xlarge'])?.size).toBe('xlarge');
    expect(cheapestPriced(shapes, ['2xlarge', '4xlarge'])?.size).toBe(
      '2xlarge',
    );
    expect(cheapestPriced(shapes, ['4xlarge'])).toBeUndefined();
    expect(cheapestPriced(shapes, [])).toBeUndefined();
  });

  it('lists every distinct price source once, with its date', () => {
    expect(describePriceSources([xlarge, twoXlarge, unpriced])).toEqual([
      'AWS EC2 on-demand Linux list price, EU (Frankfurt) (eu-central-1), as of 2026-09-17',
    ]);
    expect(describePriceSources([{ ...xlarge, priceAsOf: undefined }])).toEqual(
      ['AWS EC2 on-demand Linux list price, EU (Frankfurt) (eu-central-1)'],
    );
    expect(describePriceSources([unpriced])).toEqual([]);
  });

  it('labels a preset by its display name, or its id from an older cluster-manager', () => {
    expect(
      presetLabel({ preset: 'qwen3-8b-fp8', displayName: 'Qwen3 8B FP8' }),
    ).toBe('Qwen3 8B FP8');
    expect(presetLabel({ preset: 'qwen3-8b-fp8' })).toBe('qwen3-8b-fp8');
    expect(presetLabel({ preset: 'qwen3-8b-fp8', displayName: '' })).toBe(
      'qwen3-8b-fp8',
    );
  });
});
