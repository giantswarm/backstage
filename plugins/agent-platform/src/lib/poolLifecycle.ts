import type {
  GpuOperatorComponent,
  LifecycleStepState,
  ManagedCluster,
  NodePool,
  NodePoolWriteResult,
  ObjectAction,
  PoolLifecycleStep,
  PoolPhase,
  ServingComponent,
} from './clusterManager';
import type { LifecycleStep } from './lifecycle';

/** Poll `list_clusters` → `list_node_pools` every 10 s while a pool is unsettled, else every minute. */
export const POOL_POLL_ACTIVE_MS = 10_000;
export const POOL_POLL_IDLE_MS = 60_000;

/** What each step took in proof 1 on gazelle (seconds): the "typ." figures. */
export const TYPICAL_SECONDS = {
  release: 3,
  karpenterPool: 30,
  gpuOperator: 45,
  serving: 150,
} as const;

const SCALE_TO_ZERO = '0 nodes, launches on demand';

/**
 * The pool's phase: cluster-manager's from 0.8 on; before that derived from
 * the pool release's Ready and the replica counts, never an error.
 */
export function poolPhase(pool: NodePool, cluster: ManagedCluster): PoolPhase {
  if (pool.phase) {
    return pool.phase;
  }
  if (pool.deleting) {
    return 'removing';
  }
  const release = cluster.poolReleases.find(
    entry => entry.name === pool.ownerRelease?.name,
  );
  if (release && release.ready === false) {
    return 'creating';
  }
  return pool.readyReplicas < pool.replicas ? 'scaling' : 'ready';
}

/** The phase word of the row: `creating`, `ready · 0 nodes`, `scaling`, `removing…`, `failed · <reason>`. */
export function poolPhaseLabel(
  pool: NodePool,
  cluster: ManagedCluster,
): string {
  const phase = poolPhase(pool, cluster);
  switch (phase) {
    case 'ready': {
      const nodes = pool.readyReplicas;
      return `ready · ${nodes} ${nodes === 1 ? 'node' : 'nodes'}`;
    }
    case 'failed': {
      const failed = pool.steps?.find(step => step.state === 'failed');
      const reason = failed?.message?.split(':')[0]?.trim();
      return reason ? `failed · ${reason}` : 'failed';
    }
    case 'removing':
      return 'removing…';
    default:
      return phase;
  }
}

/**
 * The teardown's groups after Remove, in the order the objects go: the
 * serving controllers (the slice's child releases), the well-known configs,
 * the GPU operator release, the backend registration, the serving slice
 * release, the pool release — the last three only with the cluster's last pool.
 */
export const TEARDOWN_GROUPS = [
  { id: 'controllers', title: 'Serving controllers removed' },
  { id: 'configs', title: 'Well-known configs removed' },
  { id: 'operator', title: 'GPU operator release removed' },
  { id: 'backend', title: 'Backend registration removed' },
  { id: 'slice', title: 'Serving slice release removed' },
  { id: 'pool', title: 'Pool release removed' },
] as const;

export type TeardownGroup = (typeof TEARDOWN_GROUPS)[number]['id'];

/** The teardown group of an object of `delete_node_pool`'s answer, by kind and name. */
export function teardownGroupOf(
  object: Pick<ObjectAction, 'kind' | 'name'>,
  cluster: string,
  poolName: string,
): TeardownGroup {
  if (object.kind === 'ConfigMap') {
    return 'backend';
  }
  if (object.kind === 'LLMInferenceServiceConfig') {
    return 'configs';
  }
  if (object.name === `${cluster}-${poolName}`) {
    return 'pool';
  }
  if (object.name === `${cluster}-agent-platform`) {
    return 'slice';
  }
  if (object.name === `${cluster}-gpu-operator`) {
    return 'operator';
  }
  return 'controllers';
}

export type PoolTeardown = {
  cluster: string;
  poolName: string;
  /** `delete_node_pool`'s answer when the panel opened from Remove: every object of the teardown. */
  removed?: NodePoolWriteResult;
  /** RFC3339: when the delete was accepted — the steps' clock. */
  removedAt?: string;
  /** `list_node_pools`' pending objects while `phase: removing`. */
  pending: ObjectAction[];
  /** cluster-manager no longer lists the pool. */
  gone: boolean;
};

const MAX_NAMED = 3;

function named(objects: ObjectAction[]): string {
  const names = objects
    .slice(0, MAX_NAMED)
    .map(object => `${object.kind} ${object.namespace}/${object.name}`);
  const more = objects.length - names.length;
  return more > 0 ? `${names.join(', ')} and ${more} more` : names.join(', ');
}

/**
 * The teardown after Remove as steps for `LifecycleSteps`: a group is in
 * progress while `list_node_pools` still lists one of its objects as pending
 * and done once none is left; the pool release is done only once the pool is
 * gone from the list. The groups come from the delete's answer (the panel
 * opened from Remove) or, opened later by the chevron, from the pending
 * objects alone; an older cluster-manager that reports only `deleting` gets
 * the pool release as the one step.
 */
export function poolTeardownSteps(teardown: PoolTeardown): LifecycleStep[] {
  const { cluster, poolName, removed, removedAt, pending, gone } = teardown;
  const groupOf = (object: ObjectAction) =>
    teardownGroupOf(object, cluster, poolName);
  const all = removed?.objects ?? pending;
  const present = new Set<TeardownGroup>(all.map(groupOf));
  present.add('pool');
  return TEARDOWN_GROUPS.filter(group => present.has(group.id)).map(group => {
    const total = all.filter(object => groupOf(object) === group.id).length;
    const left = gone
      ? []
      : pending.filter(object => groupOf(object) === group.id);
    const objects = (n: number) => `${n} ${n === 1 ? 'object' : 'objects'}`;
    if (left.length > 0 || (group.id === 'pool' && !gone)) {
      return {
        id: group.id,
        title: group.title,
        state: 'inProgress',
        since: removedAt,
        message:
          left.length > 0
            ? `${left.length} of ${Math.max(total, left.length)} terminating: ${named(left)}`
            : 'the pool release is being uninstalled',
      };
    }
    return {
      id: group.id,
      title: group.title,
      state: 'done',
      message: total > 0 ? `${objects(total)} gone` : undefined,
    };
  });
}

function fromManager(
  id: string,
  title: string,
  step: PoolLifecycleStep,
  typicalSeconds: number,
): LifecycleStep {
  return {
    id,
    title,
    state: step.state,
    since: step.since,
    finishedAt: step.finishedAt,
    message: step.message,
    typicalSeconds,
  };
}

function releaseStep(pool: NodePool, cluster: ManagedCluster): LifecycleStep {
  const step = pool.steps?.find(entry => entry.name === 'release');
  if (step) {
    return fromManager(
      'release',
      'Pool release Ready',
      step,
      TYPICAL_SECONDS.release,
    );
  }
  const release = cluster.poolReleases.find(
    entry => entry.name === pool.ownerRelease?.name,
  );
  let state: LifecycleStepState = 'pending';
  if (release?.ready === true) {
    state = 'done';
  } else if (release?.ready === false) {
    state = 'inProgress';
  }
  return {
    id: 'release',
    title: 'Pool release Ready',
    state,
    typicalSeconds: TYPICAL_SECONDS.release,
  };
}

function karpenterPoolStep(pool: NodePool): LifecycleStep {
  const title = 'Karpenter pool ready';
  const machinePool = pool.steps?.find(entry => entry.name === 'machinePool');
  const nodes = pool.steps?.find(entry => entry.name === 'nodes');
  if (!machinePool && !nodes) {
    const done = pool.readyReplicas >= pool.replicas;
    return {
      id: 'karpenterPool',
      title,
      state: done ? 'done' : 'inProgress',
      message:
        done && pool.readyReplicas === 0
          ? SCALE_TO_ZERO
          : `${pool.readyReplicas} of ${pool.replicas} nodes ready`,
      typicalSeconds: TYPICAL_SECONDS.karpenterPool,
    };
  }
  if (machinePool && machinePool.state !== 'done') {
    return fromManager(
      'karpenterPool',
      title,
      machinePool,
      TYPICAL_SECONDS.karpenterPool,
    );
  }
  const tail = nodes ?? machinePool!;
  return {
    id: 'karpenterPool',
    title,
    state: tail.state,
    since: machinePool?.since ?? tail.since,
    finishedAt: tail.finishedAt,
    message:
      tail.state === 'done' && pool.readyReplicas === 0
        ? SCALE_TO_ZERO
        : tail.message,
    typicalSeconds: TYPICAL_SECONDS.karpenterPool,
  };
}

function condition(release: {
  reason?: string;
  message?: string;
}): string | undefined {
  return (
    [release.reason, release.message].filter(Boolean).join(': ') || undefined
  );
}

function gpuOperatorStep(component: GpuOperatorComponent): LifecycleStep {
  const id = 'gpuOperator';
  const title = 'GPU operator operational';
  const readiness = component.readiness;
  if (!readiness) {
    return {
      id,
      title,
      state: component.status === 'present' ? 'done' : 'pending',
      message: component.provider
        ? `provider ${component.provider}`
        : undefined,
      typicalSeconds: TYPICAL_SECONDS.gpuOperator,
    };
  }
  const { release, clusterPolicy } = readiness;
  if (!release) {
    return {
      id,
      title,
      state: component.status === 'present' ? 'done' : 'pending',
      message:
        component.status === 'present' && component.provider
          ? `present, provider ${component.provider}`
          : undefined,
      typicalSeconds: TYPICAL_SECONDS.gpuOperator,
    };
  }
  if (!release.ready) {
    return {
      id,
      title,
      state: release.reason?.endsWith('Failed') ? 'failed' : 'inProgress',
      since: release.since,
      message: condition(release),
      typicalSeconds: TYPICAL_SECONDS.gpuOperator,
    };
  }
  if (clusterPolicy?.state !== 'ready') {
    return {
      id,
      title,
      state: 'inProgress',
      since: release.since,
      message: clusterPolicy
        ? `ClusterPolicy ${clusterPolicy.name} ${clusterPolicy.state}`
        : 'ClusterPolicy not created yet',
      typicalSeconds: TYPICAL_SECONDS.gpuOperator,
    };
  }
  let message: string | undefined;
  if (readiness.operandsError) {
    message = `operands could not be listed: ${readiness.operandsError}`;
  } else if (readiness.operands.length === 0) {
    message = 'starts with the first node';
  } else {
    message = readiness.operands
      .map(operand => `${operand.ready}/${operand.desired} ${operand.name}`)
      .join(', ');
  }
  return {
    id,
    title,
    state: 'done',
    since: release.since,
    finishedAt: release.since,
    message,
    typicalSeconds: TYPICAL_SECONDS.gpuOperator,
  };
}

function servingStep(component: ServingComponent): LifecycleStep {
  const id = 'serving';
  const title = 'Serving stack operational';
  const readiness = component.readiness;
  if (!readiness) {
    return {
      id,
      title,
      state: component.status === 'present' ? 'done' : 'pending',
      message: component.provider
        ? `provider ${component.provider}`
        : undefined,
      typicalSeconds: TYPICAL_SECONDS.serving,
    };
  }
  const { release, children, controllers, modelsGateway } = readiness;
  if (!release) {
    return {
      id,
      title,
      state: component.status === 'present' ? 'done' : 'pending',
      message:
        component.status === 'present' && component.provider
          ? `present, provider ${component.provider}`
          : undefined,
      typicalSeconds: TYPICAL_SECONDS.serving,
    };
  }
  const waiting: string[] = [];
  if (!release.ready) {
    waiting.push(`release ${condition(release) ?? 'not Ready'}`);
  }
  const childrenNotReady = children.filter(child => !child.ready);
  waiting.push(
    ...childrenNotReady.map(
      child => `${child.name}${child.reason ? ` (${child.reason})` : ''}`,
    ),
  );
  if (children.length === 0) {
    waiting.push('the slice charts');
  }
  const controllersDown = controllers.filter(
    controller => controller.available < 1,
  );
  waiting.push(
    ...controllersDown.map(
      controller =>
        `${controller.name} ${controller.available}/${controller.replicas}`,
    ),
  );
  if (controllers.length === 0) {
    waiting.push('the KServe controllers');
  }
  if (!modelsGateway?.ready) {
    waiting.push('the models Gateway');
  }
  const failed = childrenNotReady.some(child =>
    child.reason?.endsWith('Failed'),
  );
  if (waiting.length > 0) {
    return {
      id,
      title,
      state: failed ? 'failed' : 'inProgress',
      since: release.since,
      message: `waiting for ${waiting.join(', ')}`,
      typicalSeconds: TYPICAL_SECONDS.serving,
    };
  }
  const finishedAt = [...children.map(child => child.since), release.since]
    .filter((value): value is string => Boolean(value))
    .sort()
    .pop();
  const configs =
    readiness.configs === null
      ? undefined
      : `${readiness.configs.count} configs`;
  return {
    id,
    title,
    state: 'done',
    since: release.since,
    finishedAt,
    message: [
      `${children.length} charts`,
      `${controllers.length} controllers`,
      configs,
      `models Gateway ${modelsGateway?.reason ?? 'ready'}`,
    ]
      .filter(Boolean)
      .join(', '),
    typicalSeconds: TYPICAL_SECONDS.serving,
  };
}

function backendStep(component: ServingComponent): LifecycleStep | undefined {
  const backend = component.readiness?.backend;
  if (!backend) {
    return undefined;
  }
  const id = 'backend';
  const title = 'Backend registered with model-manager';
  if (backend.registered === true) {
    return {
      id,
      title,
      state: 'done',
      message: [backend.namespace, backend.name].filter(Boolean).join('/'),
    };
  }
  if (backend.registered === false) {
    return { id, title, state: 'pending', message: 'no registration yet' };
  }
  return {
    id,
    title,
    state: 'pending',
    message: `could not read the registration${
      backend.error ? `: ${backend.error}` : ''
    }`,
  };
}

/**
 * The lifecycle of a pool as steps for `LifecycleSteps`: the pool release,
 * the Karpenter pool, the GPU operator, the serving stack and the backend
 * registration — from `list_node_pools` `steps[]` and `list_clusters`
 * `readiness`. An installation on an older cluster-manager (no `steps`, no
 * `readiness`) gets the same steps from `poolReleases[].ready` and the
 * components' `status`, fewer where nothing is known — never an error.
 */
export function poolLifecycleSteps(
  pool: NodePool,
  cluster: ManagedCluster,
): LifecycleStep[] {
  return [
    releaseStep(pool, cluster),
    karpenterPoolStep(pool),
    gpuOperatorStep(cluster.gpuOperator),
    servingStep(cluster.serving),
    backendStep(cluster.serving),
  ].filter((step): step is LifecycleStep => step !== undefined);
}

/**
 * Settled: `ready` and every lifecycle step done or failed — nothing the next
 * read would move. Unsettled pools keep the page polling at 10 s.
 */
export function isPoolSettled(
  pool: NodePool,
  cluster: ManagedCluster,
): boolean {
  if (poolPhase(pool, cluster) !== 'ready') {
    return false;
  }
  return poolLifecycleSteps(pool, cluster).every(
    step => step.state === 'done' || step.state === 'failed',
  );
}

/** react-query's `refetchInterval` for one installation's pools query. */
export function gpuNodePoolsRefetchInterval(query: {
  state: { data?: { rows: { pool: NodePool; cluster: ManagedCluster }[] } };
}): number {
  const rows = query.state.data?.rows ?? [];
  return rows.some(row => !isPoolSettled(row.pool, row.cluster))
    ? POOL_POLL_ACTIVE_MS
    : POOL_POLL_IDLE_MS;
}
