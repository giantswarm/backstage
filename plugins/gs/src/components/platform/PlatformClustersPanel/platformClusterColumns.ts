import type { SortDescriptor } from '@backstage/ui';
import { semverCompareSort } from '@giantswarm/backstage-plugin-ui-react';
import { ClusterColumns } from '../../clusters/ClustersTable/columns';
import type { ClusterData } from '../../clusters/ClustersDataProvider';
import { ClusterStatuses } from '../../clusters/ClusterStatus';
import { formatClusterProvider, ClusterTypes } from '../../clusters/utils';
import { toSentenceCase } from '../../utils/helpers';

/** A row of the shell's clusters list: a cluster, keyed across installations. */
export type PlatformClusterRow = ClusterData & { id: string };

/** The columns of the shell's clusters list, Name first and always shown. */
export const PLATFORM_CLUSTER_COLUMNS = [
  'name',
  'status',
  'environment',
  'organization',
  'release',
  'workers',
  'provider',
  'region',
  'account',
  'priority',
  'clusterApp',
  'created',
] as const;

export type PlatformClusterColumn = (typeof PLATFORM_CLUSTER_COLUMNS)[number];

export const PLATFORM_CLUSTER_COLUMN_LABELS: Record<
  PlatformClusterColumn,
  string
> = {
  name: 'Name',
  status: 'Status',
  environment: 'Environment',
  organization: 'Organization',
  release: 'Release',
  workers: 'Workers',
  provider: 'Provider',
  region: 'Region',
  account: 'Account',
  priority: 'Service priority',
  clusterApp: 'Cluster app',
  created: 'Created',
};

/** What a person sees before choosing columns. */
export const DEFAULT_PLATFORM_CLUSTER_COLUMNS: readonly PlatformClusterColumn[] =
  ['status', 'environment', 'organization', 'release', 'workers', 'created'];

/**
 * The classic data provider's columns each shown column needs read: the
 * provider reads control planes, provider clusters, identities and worker
 * capacity only for the columns that show them.
 */
const DATA_COLUMNS: Partial<Record<PlatformClusterColumn, string[]>> = {
  release: [ClusterColumns.releaseVersion, ClusterColumns.kubernetesVersion],
  workers: [ClusterColumns.workerCpu, ClusterColumns.workerMemory],
  region: [ClusterColumns.location],
  account: [ClusterColumns.awsAccountId],
  clusterApp: [ClusterColumns.appVersion],
};

/** The classic provider's column ids for the columns shown. */
export function dataColumnsOf(visible: readonly string[]): string[] {
  return visible.flatMap(
    column => DATA_COLUMNS[column as PlatformClusterColumn] ?? [],
  );
}

/**
 * The columns shown from what a person saved, always in the list's own
 * order (the store sorts what it saves): the default until they chose, and
 * only ids this list knows, so a renamed column falls away.
 */
export function visibleColumnsOf(
  saved: readonly string[],
): PlatformClusterColumn[] {
  const shown = PLATFORM_CLUSTER_COLUMNS.filter(
    id => id !== 'name' && saved.includes(id),
  );
  return shown.length > 0 ? shown : [...DEFAULT_PLATFORM_CLUSTER_COLUMNS];
}

/** The clusters' states in their lifecycle order, as the Status filter lists them. */
export const CLUSTER_STATUS_ORDER: readonly string[] = [
  ClusterStatuses.Ready,
  ClusterStatuses.Creating,
  ClusterStatuses.Deleting,
];

/** How a cluster's status reads: "Ready", "Creating", "Deleting". */
export function statusLabel(status: string): string {
  return toSentenceCase(status);
}

export function providerLabel(row: ClusterData): string | undefined {
  return row.provider ? formatClusterProvider(row.provider) : undefined;
}

export function priorityLabel(row: ClusterData): string | undefined {
  return row.priority ? toSentenceCase(row.priority) : undefined;
}

/** The service priorities, most urgent first, as they sort. */
const PRIORITY_ORDER = ['highest', 'high', 'medium', 'low', 'lowest'];

type SortKey = (row: PlatformClusterRow) => string | number | undefined;

/** Case-insensitive, digits by value: "31.10.0" after "31.9.2". */
function compareText(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

/** Columns whose values are versions, compared as semver. */
const VERSION_KEYS: Partial<
  Record<PlatformClusterColumn, (row: PlatformClusterRow) => string | undefined>
> = {
  release: row => row.releaseVersion,
  clusterApp: row => row.appVersion,
};

const SORT_KEYS: Record<PlatformClusterColumn, SortKey> = {
  name: row => row.name,
  status: row => {
    const index = CLUSTER_STATUS_ORDER.indexOf(row.status);
    return index === -1 ? undefined : index;
  },
  environment: row => row.installationName,
  organization: row => row.organization,
  release: row => row.releaseVersion,
  workers: row => row.workerCapacity?.capacity?.nodes,
  provider: row => providerLabel(row),
  region: row => row.location,
  account: row => row.awsAccountId,
  priority: row => {
    const index = row.priority ? PRIORITY_ORDER.indexOf(row.priority) : -1;
    return index === -1 ? undefined : index;
  },
  clusterApp: row => row.appVersion,
  created: row => (row.created ? Date.parse(row.created) : undefined),
};

/**
 * The rows in the order a header asks for. Rows without the value go last
 * whichever way the column sorts; ties keep the name order, management
 * clusters first.
 */
export function sortPlatformClusterRows(
  rows: readonly PlatformClusterRow[],
  sort: SortDescriptor,
): PlatformClusterRow[] {
  const column = String(sort.column) as PlatformClusterColumn;
  const keyOf = SORT_KEYS[column] ?? SORT_KEYS.name;
  const direction = sort.direction === 'descending' ? -1 : 1;
  const versionOf = VERSION_KEYS[column];
  // Pre-releases before their release, as the classic table sorts them;
  // rows without a version last either way.
  const compareVersions = versionOf
    ? semverCompareSort(versionOf, { descending: direction < 0 })
    : undefined;
  const byName = (a: PlatformClusterRow, b: PlatformClusterRow) =>
    Number(b.type === ClusterTypes.Management) -
      Number(a.type === ClusterTypes.Management) ||
    compareText(a.name, b.name) ||
    compareText(a.installationName, b.installationName);
  return [...rows].sort((a, b) => {
    if (compareVersions) {
      return compareVersions(a, b) || byName(a, b);
    }
    const x = keyOf(a);
    const y = keyOf(b);
    if (x === undefined || y === undefined) {
      if (x !== y) {
        return x === undefined ? 1 : -1;
      }
      return byName(a, b);
    }
    let order: number;
    if (typeof x === 'number' && typeof y === 'number') {
      order = x - y;
    } else {
      order = compareText(String(x), String(y));
    }
    return order * direction || byName(a, b);
  });
}

export const PLATFORM_CLUSTERS_DEFAULT_SORT: SortDescriptor = {
  column: 'name',
  direction: 'ascending',
};
