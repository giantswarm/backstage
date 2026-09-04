import { MimirQueryResponse } from '../../apis/mimir/types';
import {
  buildQuery,
  parseResponse,
  UNKNOWN_MIX_VALUE,
} from './useKarpenterNodePoolStatus';

function makeSample(
  metric: Record<string, string>,
  value: string,
): { metric: Record<string, string>; value: [number, string] } {
  return { metric, value: [1234567890, value] };
}

function makeResponse(
  ...samples: ReturnType<typeof makeSample>[]
): MimirQueryResponse {
  return {
    status: 'success',
    data: { resultType: 'vector', result: samples },
  } as MimirQueryResponse;
}

function nodeMix(labels: Record<string, string>, count: string) {
  return makeSample({ series: 'node_mix', ...labels }, count);
}

describe('buildQuery', () => {
  const query = buildQuery('my-cluster', 'my-pool');

  it('scopes every branch to the cluster and node pool', () => {
    const matchers = query.match(
      /cluster_id="my-cluster", nodepool="my-pool"/g,
    );
    expect(matchers).toHaveLength(4);
  });

  it('pins a single resource type so each node is counted once', () => {
    expect(query).toContain('resource_type="cpu"');
  });

  it('aggregates the distribution over every dimension it renders', () => {
    expect(query).toContain(
      'count by (capacity_type, arch, instance_family, instance_type, zone)',
    );
  });

  it('tags each branch with a distinct series label', () => {
    for (const series of [
      'node_mix',
      'limit',
      'usage',
      'allowed_disruptions',
    ]) {
      expect(query).toContain(`"series", "${series}"`);
    }
  });

  it('sanitizes injected label values', () => {
    const injected = buildQuery('a"} or up{', 'b\\c');
    expect(injected).toContain('cluster_id="a or up{"');
    expect(injected).not.toContain('a"}');
  });
});

describe('parseResponse', () => {
  it('returns undefined for missing or empty results', () => {
    expect(parseResponse(undefined)).toBeUndefined();
    expect(parseResponse(makeResponse())).toBeUndefined();
  });

  it('aggregates the node distribution across dimensions', () => {
    const status = parseResponse(
      makeResponse(
        nodeMix(
          {
            capacity_type: 'spot',
            arch: 'amd64',
            instance_family: 'm7i',
            instance_type: 'm7i.xlarge',
            zone: 'eu-central-1a',
          },
          '2',
        ),
        nodeMix(
          {
            capacity_type: 'spot',
            arch: 'amd64',
            instance_family: 'r8i',
            instance_type: 'r8i.xlarge',
            zone: 'eu-central-1b',
          },
          '3',
        ),
        nodeMix(
          {
            capacity_type: 'on-demand',
            arch: 'arm64',
            instance_family: 'c7g',
            instance_type: 'c7g.xlarge',
            zone: 'eu-central-1a',
          },
          '1',
        ),
      ),
    );

    expect(status?.capacityTypes).toEqual([
      { value: 'spot', count: 5 },
      { value: 'on-demand', count: 1 },
    ]);
    expect(status?.architectures).toEqual([
      { value: 'amd64', count: 5 },
      { value: 'arm64', count: 1 },
    ]);
    expect(status?.zones).toEqual([
      { value: 'eu-central-1a', count: 3 },
      { value: 'eu-central-1b', count: 3 },
    ]);
    expect(status?.totalNodes).toBe(6);
  });

  it('sorts buckets by count descending, then value ascending', () => {
    const status = parseResponse(
      makeResponse(
        nodeMix({ instance_family: 'b' }, '1'),
        nodeMix({ instance_family: 'a' }, '1'),
        nodeMix({ instance_family: 'c' }, '5'),
      ),
    );

    expect(status?.instanceFamilies).toEqual([
      { value: 'c', count: 5 },
      { value: 'a', count: 1 },
      { value: 'b', count: 1 },
    ]);
  });

  it('returns undefined for a dimension whose label is absent everywhere', () => {
    const status = parseResponse(
      makeResponse(nodeMix({ instance_type: 'm7i.large' }, '3')),
    );

    expect(status?.capacityTypes).toBeUndefined();
    expect(status?.architectures).toBeUndefined();
    expect(status?.instanceTypes).toEqual([{ value: 'm7i.large', count: 3 }]);
  });

  it('adds an unknown bucket for partial label coverage', () => {
    const status = parseResponse(
      makeResponse(nodeMix({ capacity_type: 'spot' }, '4'), nodeMix({}, '2')),
    );

    expect(status?.capacityTypes).toEqual([
      { value: 'spot', count: 4 },
      { value: UNKNOWN_MIX_VALUE, count: 2 },
    ]);
  });

  it('reads limits and usage by resource type', () => {
    const status = parseResponse(
      makeResponse(
        makeSample({ series: 'limit', resource_type: 'cpu' }, '1000'),
        makeSample(
          { series: 'limit', resource_type: 'memory' },
          '1073741824000',
        ),
        makeSample({ series: 'usage', resource_type: 'cpu' }, '60'),
        makeSample({ series: 'usage', resource_type: 'nodes' }, '15'),
      ),
    );

    expect(status?.limits).toEqual({ cpu: 1000, memory: 1073741824000 });
    expect(status?.usage).toEqual({ cpu: 60, nodes: 15 });
  });

  it('prefers the reported node count over the summed distribution', () => {
    const status = parseResponse(
      makeResponse(
        nodeMix({ capacity_type: 'spot' }, '14'),
        makeSample({ series: 'usage', resource_type: 'nodes' }, '15'),
      ),
    );

    expect(status?.totalNodes).toBe(15);
  });

  it('reads allowed disruptions', () => {
    const status = parseResponse(
      makeResponse(makeSample({ series: 'allowed_disruptions' }, '4')),
    );

    expect(status?.allowedDisruptions).toBe(4);
  });

  it('ignores unparseable sample values', () => {
    const status = parseResponse(
      makeResponse(
        makeSample({ series: 'usage', resource_type: 'cpu' }, 'NaN'),
      ),
    );

    expect(status?.usage).toEqual({});
  });
});
