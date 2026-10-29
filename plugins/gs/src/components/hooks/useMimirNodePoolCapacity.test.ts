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
    expect(query).toContain(
      'or label_replace(count by (cluster_id, nodepool) (',
    );
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

  it('groups nodes, CPU and memory by cluster and pool', () => {
    const result = parseNodePoolCapacity(
      [
        sample('c1', 'p1', 'nodes', '2'),
        sample('c1', 'p1', 'cpu', '8'),
        sample('c1', 'p1', 'memory', '1024'),
        sample('c2', 'p2', 'nodes', '1'),
        sample('c2', 'p2', 'cpu', '4'),
        sample('c2', 'p2', 'memory', '2048'),
      ],
      ['c1', 'c2'],
    );

    expect(result.c1.p1).toEqual({
      nodes: 2,
      vcpus: 8,
      memoryBytes: 1024,
    });
    expect(result.c2.p2).toEqual({
      nodes: 1,
      vcpus: 4,
      memoryBytes: 2048,
    });
  });

  it('leaves out a pool missing a resource or with a non-numeric value', () => {
    const result = parseNodePoolCapacity(
      [
        sample('c1', 'no-nodes', 'cpu', '8'),
        sample('c1', 'no-nodes', 'memory', '1024'),
        sample('c1', 'nan', 'nodes', '1'),
        sample('c1', 'nan', 'cpu', 'NaN'),
        sample('c1', 'nan', 'memory', '1024'),
      ],
      ['c1'],
    );

    expect(result).toEqual({ c1: {} });
  });

  it('has an entry for each queried cluster and none for another', () => {
    const result = parseNodePoolCapacity(
      [
        sample('c1', 'p1', 'nodes', '1'),
        sample('c1', 'p1', 'cpu', '4'),
        sample('c1', 'p1', 'memory', '2048'),
        sample('other', 'p1', 'nodes', '1'),
      ],
      ['c1', 'quiet'],
    );

    expect(result).toEqual({
      c1: { p1: { nodes: 1, vcpus: 4, memoryBytes: 2048 } },
      quiet: {},
    });
  });

  it('survives a JSON round trip, as the persisted query cache makes', () => {
    const result = parseNodePoolCapacity(
      [
        sample('c1', 'p1', 'nodes', '1'),
        sample('c1', 'p1', 'cpu', '4'),
        sample('c1', 'p1', 'memory', '2048'),
      ],
      ['c1'],
    );

    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });
});
