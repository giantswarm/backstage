import type { ManagedCluster, NodePool } from './clusterManager';
import { formatSeconds, stepTiming } from './lifecycle';
import {
  gpuNodePoolsRefetchInterval,
  isPoolSettled,
  POOL_POLL_ACTIVE_MS,
  POOL_POLL_IDLE_MS,
  poolLifecycleSteps,
  poolPhaseLabel,
} from './poolLifecycle';

const T0 = '2026-09-17T11:33:22Z';
const T1 = '2026-09-17T11:33:36Z';

function pool(overrides: Partial<NodePool> = {}): NodePool {
  return {
    name: 'gazelle-gf',
    namespace: 'org-giantswarm',
    version: 'v1.31.4',
    controlPlaneVersion: 'v1.31.4',
    replicas: 0,
    readyReplicas: 0,
    instanceTypes: ['g6.2xlarge'],
    accelerator: 'nvidia-l4',
    ownerRelease: { name: 'gazelle-gf', namespace: 'org-giantswarm' },
    ...overrides,
  };
}

function cluster(overrides: Partial<ManagedCluster> = {}): ManagedCluster {
  return {
    name: 'gazelle',
    namespace: 'org-giantswarm',
    organization: 'giantswarm',
    releaseVersion: '31.0.0',
    ownCluster: true,
    gpuOperator: { status: 'absent' },
    serving: { status: 'absent' },
    poolReleases: [],
    commitTarget: null,
    ...overrides,
  };
}

/** cluster-manager 0.8.1's answer once everything is Ready (cm-41-fix live check). */
const READY_CLUSTER = cluster({
  gpuOperator: {
    status: 'present',
    provider: 'cluster-manager',
    readiness: {
      release: {
        name: 'gazelle-gpu-operator',
        ready: true,
        reason: 'InstallSucceeded',
        since: T1,
      },
      clusterPolicy: { name: 'cluster-policy', state: 'ready' },
      operands: [],
      operandsMessage: 'no operand DaemonSet: … (none at scale-to-zero)',
    },
  },
  serving: {
    status: 'present',
    provider: 'cluster-manager',
    readiness: {
      release: { name: 'gazelle-agent-platform', ready: true, since: T0 },
      children: [
        {
          name: 'agent-platform-connectivity',
          ready: true,
          since: '2026-09-17T11:35:10Z',
        },
        { name: 'kserve-resources', ready: true, since: T1 },
      ],
      controllers: [
        { name: 'kserve-controller-manager', available: 1, replicas: 1 },
      ],
      configs: { count: 10 },
      backend: {
        registered: true,
        namespace: 'agent-platform',
        name: 'model-backend-kserve',
      },
      presets: { count: 9 },
      modelsGateway: { name: 'models', ready: true, reason: 'Programmed' },
    },
  },
  poolReleases: [
    {
      name: 'gazelle-gf',
      namespace: 'org-giantswarm',
      chartVersion: '0.3.1',
      ready: true,
    },
  ],
});

const READY_POOL = pool({
  phase: 'ready',
  steps: [
    { name: 'release', state: 'done', since: T0, finishedAt: T0 },
    { name: 'machinePool', state: 'done', since: T1, finishedAt: T1 },
    {
      name: 'nodes',
      state: 'done',
      since: T1,
      finishedAt: T1,
      message:
        '0 nodes: scale-to-zero, a node launches with the first predictor',
    },
  ],
});

describe('poolPhaseLabel', () => {
  it('reads ready · 0 nodes at scale-to-zero, never 0 / 0', () => {
    expect(poolPhaseLabel(READY_POOL, READY_CLUSTER)).toBe('ready · 0 nodes');
    expect(
      poolPhaseLabel(
        pool({ phase: 'ready', readyReplicas: 1, replicas: 1 }),
        READY_CLUSTER,
      ),
    ).toBe('ready · 1 node');
  });

  it('names the phase, and the failed reason', () => {
    expect(poolPhaseLabel(pool({ phase: 'creating' }), READY_CLUSTER)).toBe(
      'creating',
    );
    expect(poolPhaseLabel(pool({ phase: 'removing' }), READY_CLUSTER)).toBe(
      'removing',
    );
    expect(
      poolPhaseLabel(
        pool({
          phase: 'failed',
          steps: [
            {
              name: 'release',
              state: 'failed',
              message: 'InstallFailed: chart not found',
            },
          ],
        }),
        READY_CLUSTER,
      ),
    ).toBe('failed · InstallFailed');
  });

  it('derives the phase from poolReleases[].ready on an older cluster-manager', () => {
    const older = cluster({
      poolReleases: [
        {
          name: 'gazelle-gf',
          namespace: 'org-giantswarm',
          chartVersion: '0.3.1',
          ready: false,
        },
      ],
    });
    expect(poolPhaseLabel(pool(), older)).toBe('creating');
    expect(poolPhaseLabel(pool(), READY_CLUSTER)).toBe('ready · 0 nodes');
    expect(
      poolPhaseLabel(pool({ replicas: 2, readyReplicas: 1 }), READY_CLUSTER),
    ).toBe('scaling');
  });
});

describe('poolLifecycleSteps', () => {
  it('maps a creating pool on a cluster still installing to the five steps in order', () => {
    const creating = pool({
      phase: 'creating',
      steps: [
        {
          name: 'release',
          state: 'inProgress',
          since: T0,
          message: "Running 'install' action",
        },
        {
          name: 'machinePool',
          state: 'pending',
          message: 'MachinePool not created yet',
        },
        { name: 'nodes', state: 'pending' },
      ],
    });
    const installing = cluster({
      gpuOperator: {
        status: 'absent',
        readiness: {
          release: {
            name: 'op',
            ready: false,
            reason: 'Progressing',
            since: T0,
          },
          clusterPolicy: null,
          operands: [],
        },
      },
      serving: {
        status: 'present',
        provider: 'cluster-manager',
        readiness: {
          release: { name: 'slice', ready: true, since: T0 },
          children: [
            {
              name: 'agent-platform-connectivity',
              ready: false,
              reason: 'Progressing',
            },
            { name: 'kserve-resources', ready: true },
          ],
          controllers: [
            { name: 'kserve-controller-manager', available: 0, replicas: 1 },
          ],
          configs: null,
          backend: { registered: false },
          presets: null,
          modelsGateway: null,
        },
      },
    });
    const steps = poolLifecycleSteps(creating, installing);
    expect(steps.map(step => [step.id, step.state])).toEqual([
      ['release', 'inProgress'],
      ['karpenterPool', 'pending'],
      ['gpuOperator', 'inProgress'],
      ['serving', 'inProgress'],
      ['backend', 'pending'],
    ]);
    expect(steps[3].message).toBe(
      'waiting for agent-platform-connectivity (Progressing), kserve-controller-manager 0/1, the models Gateway',
    );
    expect(steps[4].message).toBe('no registration yet');
    expect(isPoolSettled(creating, installing)).toBe(false);
  });

  it('is done everywhere once cluster-manager reports Ready, with the scale-to-zero wording', () => {
    const steps = poolLifecycleSteps(READY_POOL, READY_CLUSTER);
    expect(steps.every(step => step.state === 'done')).toBe(true);
    expect(steps[1].message).toBe('0 nodes, launches on demand');
    expect(steps[2].message).toBe('starts with the first node');
    expect(steps[3].message).toBe(
      '2 charts, 1 controllers, 10 configs, models Gateway Programmed',
    );
    expect(steps[4].message).toBe('agent-platform/model-backend-kserve');
    expect(isPoolSettled(READY_POOL, READY_CLUSTER)).toBe(true);
  });

  it('renders a backend that could not be read as such, never as not registered', () => {
    const unreadable = cluster({
      serving: {
        ...READY_CLUSTER.serving,
        readiness: {
          ...READY_CLUSTER.serving.readiness!,
          backend: { error: 'configmaps is forbidden' },
        },
      },
    });
    const backend = poolLifecycleSteps(READY_POOL, unreadable).find(
      step => step.id === 'backend',
    )!;
    expect(backend.state).toBe('pending');
    expect(backend.message).toBe(
      'could not read the registration: configmaps is forbidden',
    );
  });

  it('falls back to poolReleases and the components status on an older cluster-manager, with fewer steps', () => {
    const older = cluster({
      gpuOperator: { status: 'present', provider: 'cluster-manager' },
      serving: { status: 'absent' },
      poolReleases: [
        {
          name: 'gazelle-gf',
          namespace: 'org-giantswarm',
          chartVersion: '0.3.1',
          ready: true,
        },
      ],
    });
    const steps = poolLifecycleSteps(pool(), older);
    expect(steps.map(step => [step.id, step.state])).toEqual([
      ['release', 'done'],
      ['karpenterPool', 'done'],
      ['gpuOperator', 'done'],
      ['serving', 'pending'],
    ]);
    expect(steps[1].message).toBe('0 nodes, launches on demand');
  });
});

describe('gpuNodePoolsRefetchInterval', () => {
  it('polls at 10 s while a pool is unsettled and at 60 s once every step is done', () => {
    const creating = pool({ phase: 'creating' });
    expect(
      gpuNodePoolsRefetchInterval({
        state: { data: { rows: [{ pool: creating, cluster: READY_CLUSTER }] } },
      }),
    ).toBe(POOL_POLL_ACTIVE_MS);
    expect(
      gpuNodePoolsRefetchInterval({
        state: {
          data: { rows: [{ pool: READY_POOL, cluster: READY_CLUSTER }] },
        },
      }),
    ).toBe(POOL_POLL_IDLE_MS);
    expect(gpuNodePoolsRefetchInterval({ state: {} })).toBe(POOL_POLL_IDLE_MS);
  });

  it('keeps polling while the pool is ready but the serving stack is not', () => {
    const halfway = cluster({
      ...READY_CLUSTER,
      serving: {
        ...READY_CLUSTER.serving,
        readiness: { ...READY_CLUSTER.serving.readiness!, modelsGateway: null },
      },
    });
    expect(
      gpuNodePoolsRefetchInterval({
        state: { data: { rows: [{ pool: READY_POOL, cluster: halfway }] } },
      }),
    ).toBe(POOL_POLL_ACTIVE_MS);
  });
});

describe('stepTiming', () => {
  const now = Date.parse('2026-09-17T11:36:00Z');

  it('says when a running step started and what it usually takes', () => {
    expect(
      stepTiming(
        {
          state: 'inProgress',
          since: '2026-09-17T11:35:18Z',
          typicalSeconds: 30,
        },
        now,
      ),
    ).toBe('started 42 s ago · typ. 30 s');
    expect(stepTiming({ state: 'pending', typicalSeconds: 150 }, now)).toBe(
      'typ. 2 min 30 s',
    );
  });

  it('says how long a done step took, or when it finished when the manager gives one instant', () => {
    expect(
      stepTiming(
        { state: 'done', since: T0, finishedAt: '2026-09-17T11:33:25Z' },
        now,
      ),
    ).toBe('took 3 s');
    expect(stepTiming({ state: 'done', since: T1, finishedAt: T1 }, now)).toBe(
      'done 2 min 24 s ago',
    );
    expect(stepTiming({ state: 'failed', since: T1 }, now)).toBe(
      'failed 2 min 24 s ago',
    );
  });

  it('formats spans at a glance', () => {
    expect(formatSeconds(3)).toBe('3 s');
    expect(formatSeconds(120)).toBe('2 min');
    expect(formatSeconds(3900)).toBe('1 h 5 min');
  });
});
