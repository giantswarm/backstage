import {
  ClusterManagerError,
  ClusterManagerNotConnectedError,
  classifyClusterManagerError,
  clusterManagerToolName,
  describeComponent,
  groupManifestsByRelease,
  isValidPoolName,
  manifestFilename,
  parseReplicasGuard,
  poolNameOf,
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

describe('parseReplicasGuard', () => {
  it('reads the count and the nodes from the refusal', () => {
    const guard = parseReplicasGuard(
      "node pool gpu-l4 still runs 2 node(s) (i-0abc, i-0def): something is scheduled on them — check the cluster's Serving group, scale the workloads away and re-run once the pool is empty, or pass force to delete the pool with its nodes",
    );
    expect(guard).toMatchObject({
      pool: 'gpu-l4',
      count: 2,
      nodes: ['i-0abc', 'i-0def'],
    });
  });
  it('is undefined for any other refusal', () => {
    expect(
      parseReplicasGuard(
        'HelmRelease org-acme/wc1-def00 was not created by cluster-manager',
      ),
    ).toBeUndefined();
  });
});

describe('classifyClusterManagerError', () => {
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
