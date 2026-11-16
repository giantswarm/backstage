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
