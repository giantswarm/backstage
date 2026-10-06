import {
  buildNodePoolCapacityQuery,
  parseNodePoolCapacity,
} from './useMimirNodePoolCapacity';

describe('buildNodePoolCapacityQuery', () => {
  it('sums the capacity of Ready nodes by cluster and node pool', () => {
    const query = buildNodePoolCapacityQuery(['c1', 'c"2']);

    expect(query).toContain('sum by (cluster_id, nodepool, resource)');
    expect(query).toContain(
      'kube_node_status_capacity{cluster_id=~"c1|c2", resource=~"cpu|memory"}',
    );
    expect(query).toContain(
      'kube_node_labels{cluster_id=~"c1|c2", nodepool!=""}',
    );
    expect(query).toContain('condition="Ready", status="true"} == 1');
  });
});

describe('parseNodePoolCapacity', () => {
  const sample = (
    clusterId: string,
    nodepool: string,
    resource: string,
    value: string,
  ) => ({
    metric: { cluster_id: clusterId, nodepool, resource },
    value: [0, value] as [number, string],
  });

  it('groups CPU and memory by cluster and pool', () => {
    const result = parseNodePoolCapacity([
      sample('c1', 'p1', 'cpu', '8'),
      sample('c1', 'p1', 'memory', '1024'),
      sample('c2', 'p2', 'cpu', '4'),
      sample('c2', 'p2', 'memory', '2048'),
    ]);

    expect(result.get('c1')?.get('p1')).toEqual({
      vcpus: 8,
      memoryBytes: 1024,
    });
    expect(result.get('c2')?.get('p2')).toEqual({
      vcpus: 4,
      memoryBytes: 2048,
    });
  });

  it('leaves out a pool missing a resource or with a non-numeric value', () => {
    const result = parseNodePoolCapacity([
      sample('c1', 'cpu-only', 'cpu', '8'),
      sample('c1', 'nan', 'cpu', 'NaN'),
      sample('c1', 'nan', 'memory', '1024'),
    ]);

    expect(result.get('c1')?.size).toBe(0);
  });
});
