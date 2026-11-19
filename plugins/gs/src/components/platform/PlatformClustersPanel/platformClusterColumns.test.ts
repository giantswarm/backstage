import type { ClusterData } from '../../clusters/ClustersDataProvider';
import {
  dataColumnsOf,
  DEFAULT_PLATFORM_CLUSTER_COLUMNS,
  type PlatformClusterRow,
  sortPlatformClusterRows,
  visibleColumnsOf,
} from './platformClusterColumns';

function row(
  name: string,
  data: Partial<ClusterData> = {},
): PlatformClusterRow {
  return {
    id: name,
    installationName: 'meadow',
    name,
    type: 'workload',
    status: 'ready',
    apiVersion: 'cluster.x-k8s.io/v1beta2',
    ...data,
  };
}

describe('visibleColumnsOf', () => {
  it('shows the default columns until a person chose', () => {
    expect(visibleColumnsOf([])).toEqual(DEFAULT_PLATFORM_CLUSTER_COLUMNS);
  });

  it('keeps the columns a person chose, without the name, and drops unknown ones', () => {
    expect(visibleColumnsOf(['name', 'region', 'gone'])).toEqual(['region']);
  });

  it('keeps the list order whatever order the store saved', () => {
    // useTableColumns saves its list sorted alphabetically.
    expect(
      visibleColumnsOf([
        'created',
        'environment',
        'name',
        'organization',
        'region',
        'release',
        'status',
        'workers',
      ]),
    ).toEqual([
      'status',
      'environment',
      'organization',
      'release',
      'workers',
      'region',
      'created',
    ]);
  });

  it('shows the name alone when a person unchecked every other column', () => {
    expect(visibleColumnsOf(['name'])).toEqual([]);
  });

  it('falls back to the default when nothing saved is known any more', () => {
    expect(visibleColumnsOf(['gone'])).toEqual(
      DEFAULT_PLATFORM_CLUSTER_COLUMNS,
    );
  });
});

describe('dataColumnsOf', () => {
  it('asks the data provider for what the shown columns need', () => {
    expect(dataColumnsOf(['status', 'release', 'workers', 'account'])).toEqual([
      'releaseVersion',
      'kubernetesVersion',
      'workerCpu',
      'workerMemory',
      'awsAccountId',
    ]);
  });
});

describe('sortPlatformClusterRows', () => {
  const rows = [
    row('cedar', {
      releaseVersion: '31.10.0',
      created: '2026-01-02T00:00:00Z',
    }),
    row('alder', { releaseVersion: '31.9.2', created: '2025-01-02T00:00:00Z' }),
    row('birch'),
  ];

  it('sorts by name by default', () => {
    expect(
      sortPlatformClusterRows(rows, {
        column: 'name',
        direction: 'ascending',
      }).map(r => r.name),
    ).toEqual(['alder', 'birch', 'cedar']);
  });

  it('sorts versions by their numbers and puts rows without one last either way', () => {
    const ascending = sortPlatformClusterRows(rows, {
      column: 'release',
      direction: 'ascending',
    });
    const descending = sortPlatformClusterRows(rows, {
      column: 'release',
      direction: 'descending',
    });
    expect(ascending.map(r => r.name)).toEqual(['alder', 'cedar', 'birch']);
    expect(descending.map(r => r.name)).toEqual(['cedar', 'alder', 'birch']);
  });

  it('sorts by creation time, newest first descending', () => {
    expect(
      sortPlatformClusterRows(rows, {
        column: 'created',
        direction: 'descending',
      }).map(r => r.name),
    ).toEqual(['cedar', 'alder', 'birch']);
  });

  it('sorts the status in lifecycle order, as the Status filter lists it', () => {
    const byStatus = sortPlatformClusterRows(
      [
        row('a', { status: 'deleting' }),
        row('b', { status: 'ready' }),
        row('c', { status: 'creating' }),
      ],
      { column: 'status', direction: 'ascending' },
    );
    expect(byStatus.map(r => r.name)).toEqual(['b', 'c', 'a']);
  });

  it('sorts releases as semver, a pre-release before its release', () => {
    const byRelease = sortPlatformClusterRows(
      [
        row('a', { releaseVersion: '31.0.0' }),
        row('b', { releaseVersion: '31.0.0-alpha.1' }),
        row('c', { releaseVersion: '30.9.0' }),
      ],
      { column: 'release', direction: 'ascending' },
    );
    expect(byRelease.map(r => r.name)).toEqual(['c', 'b', 'a']);
  });

  it('sorts the workers by their node count', () => {
    const capacity = (nodes: number, vcpus: number) => ({
      isLoading: false,
      capacity: { nodes, vcpus, memoryBytes: 0, uncountedPools: [] },
    });
    const byWorkers = sortPlatformClusterRows(
      [
        row('a', { workerCapacity: capacity(9, 8) }),
        row('b', { workerCapacity: capacity(2, 64) }),
        row('c'),
      ],
      { column: 'workers', direction: 'ascending' },
    );
    expect(byWorkers.map(r => r.name)).toEqual(['b', 'a', 'c']);
  });

  it('sorts the service priority by urgency, not alphabetically', () => {
    const byPriority = sortPlatformClusterRows(
      [
        row('a', { priority: 'lowest' }),
        row('b', { priority: 'highest' }),
        row('c', { priority: 'medium' }),
      ],
      { column: 'priority', direction: 'ascending' },
    );
    expect(byPriority.map(r => r.name)).toEqual(['b', 'c', 'a']);
  });
});
