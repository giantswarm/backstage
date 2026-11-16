import { useMemo, useState } from 'react';
import {
  Cell,
  CellText,
  type ColumnConfig,
  Flex,
  SearchField,
  type SortDescriptor,
  Table,
  Text,
} from '@backstage/ui';
import {
  type CatalogFacet,
  CatalogFilterBar,
  CatalogNoMatch,
  ColumnPicker,
  EmptyStateCard,
  formatLocalDateFull,
  getRelativeDate,
  INITIAL_ROWS,
  isSearchableList,
  LoadingIndicator,
  ShowMore,
  StackedRowList,
  StatusDot,
  type StatusDotTone,
  useCatalogFilters,
  usePhoneLayout,
} from '@giantswarm/backstage-plugin-ui-react';
import {
  ClusterTypeManagementIcon,
  KubernetesIcon,
} from '../../../assets/icons/CustomIcons';
import { useClustersData } from '../../clusters/ClustersDataProvider';
import { ClusterStatuses } from '../../clusters/ClusterStatus';
import {
  formatWorkerCpu,
  formatWorkerMemory,
  formatWorkerNodes,
  hasUnknownResources,
} from '../../clusters/nodePools';
import { ClusterTypes } from '../../clusters/utils';
import { useK8sVersionEOLDate } from '../../hooks/useK8sVersionEOLDate';
import { getKubernetesReleaseEOLStatus } from '../../utils/getKubernetesReleaseEOLStatus';
import { formatVersion } from '../../utils/helpers';
import {
  PLATFORM_CLUSTER_COLUMN_LABELS,
  PLATFORM_CLUSTER_COLUMNS,
  PLATFORM_CLUSTERS_DEFAULT_SORT,
  type PlatformClusterColumn,
  type PlatformClusterRow,
  priorityLabel,
  providerLabel,
  sortPlatformClusterRows,
  statusLabel,
} from './platformClusterColumns';
import {
  usePlatformClustersLoading,
  usePlatformClustersState,
} from './PlatformClustersProvider';
import { UnlistedEnvironmentsAlert } from './UnlistedEnvironmentsAlert';

const STATUS_TONES: Record<string, StatusDotTone> = {
  [ClusterStatuses.Ready]: 'success',
  [ClusterStatuses.Creating]: 'info',
  [ClusterStatuses.Deleting]: 'neutral',
};

/** The list's dropdowns: where, whose, in what state, on which release. */
const CLUSTER_FACETS: CatalogFacet<PlatformClusterRow>[] = [
  {
    id: 'environment',
    label: 'Environment',
    value: row => row.installationName,
  },
  {
    id: 'organization',
    label: 'Organization',
    value: row => row.organization,
  },
  {
    id: 'status',
    label: 'Status',
    value: row => row.status,
    optionLabel: statusLabel,
    order: [
      ClusterStatuses.Ready,
      ClusterStatuses.Creating,
      ClusterStatuses.Deleting,
    ],
  },
  {
    id: 'release',
    label: 'Release',
    value: row => row.releaseVersion,
  },
];

const PICKER_OPTIONS = PLATFORM_CLUSTER_COLUMNS.map(id => ({
  id,
  label: PLATFORM_CLUSTER_COLUMN_LABELS[id],
  isFixed: id === 'name',
}));

function searchRows(
  rows: readonly PlatformClusterRow[],
  search: string,
): PlatformClusterRow[] {
  const term = search.trim().toLowerCase();
  if (!term) {
    return [...rows];
  }
  return rows.filter(row =>
    [row.name, row.description, row.installationName, row.organization]
      .filter(Boolean)
      .some(value => value!.toLowerCase().includes(term)),
  );
}

function ClusterStatusDot({ status }: { status: string }) {
  return (
    <StatusDot
      tone={STATUS_TONES[status] ?? 'neutral'}
      label={statusLabel(status)}
    />
  );
}

/**
 * The release, then the Kubernetes minor version it runs, marked when that
 * version is past its end of life.
 */
function ReleaseCell({ row }: { row: PlatformClusterRow }) {
  const eolDate = useK8sVersionEOLDate(row.kubernetesVersion);
  const eol = getKubernetesReleaseEOLStatus(eolDate as string);
  const kubernetes = row.kubernetesVersion
    ? formatVersion(row.kubernetesVersion).split('.').slice(0, 2).join('.')
    : undefined;
  return (
    <Cell>
      <Flex align="center" gap="3" style={{ flexWrap: 'wrap' }}>
        <Text variant="body-medium">{row.releaseVersion ?? '—'}</Text>
        {kubernetes && (
          <Text
            variant="body-small"
            color="secondary"
            title={`Kubernetes ${kubernetes}`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
          >
            <KubernetesIcon titleAccess="Kubernetes" style={{ fontSize: 14 }} />
            {kubernetes}
          </Text>
        )}
        {kubernetes && eol.isEol && (
          <Text
            variant="body-small"
            weight="bold"
            color="warning"
            title={eol.message}
          >
            EOL
          </Text>
        )}
      </Flex>
    </Cell>
  );
}

function workersOf(row: PlatformClusterRow): {
  nodes: string;
  resources?: string;
} {
  const workerCapacity = row.workerCapacity;
  if (!workerCapacity || workerCapacity.isLoading) {
    return { nodes: '…' };
  }
  const capacity = workerCapacity.capacity;
  if (!capacity) {
    return { nodes: '—', resources: workerCapacity.errorMessage };
  }
  return {
    nodes: formatWorkerNodes(capacity.nodes),
    resources: hasUnknownResources(capacity)
      ? undefined
      : `${formatWorkerCpu(capacity.vcpus)} · ${formatWorkerMemory(capacity.memoryBytes)}`,
  };
}

function createdOf(row: PlatformClusterRow, now: Date) {
  if (!row.created) {
    return undefined;
  }
  return {
    relative: getRelativeDate(row.created, now),
    full: formatLocalDateFull(row.created),
  };
}

function nameCell(row: PlatformClusterRow) {
  return (
    <CellText
      title={row.name}
      description={row.description}
      leadingIcon={
        row.type === ClusterTypes.Management ? (
          <ClusterTypeManagementIcon
            titleAccess="Management cluster"
            style={{ fontSize: 18 }}
          />
        ) : undefined
      }
    />
  );
}

function useColumns(
  now: Date,
): Record<
  PlatformClusterColumn,
  Omit<ColumnConfig<PlatformClusterRow>, 'id' | 'label'>
> {
  return {
    name: {
      isRowHeader: true,
      defaultWidth: '2fr',
      minWidth: 180,
      cell: nameCell,
    },
    status: {
      defaultWidth: '1fr',
      minWidth: 120,
      cell: row => (
        <Cell>
          <ClusterStatusDot status={row.status} />
        </Cell>
      ),
    },
    environment: {
      defaultWidth: '1fr',
      minWidth: 120,
      cell: row => <CellText title={row.installationName} />,
    },
    organization: {
      defaultWidth: '1fr',
      minWidth: 120,
      cell: row => <CellText title={row.organization ?? '—'} />,
    },
    release: {
      defaultWidth: '1.4fr',
      minWidth: 170,
      cell: row => <ReleaseCell row={row} />,
    },
    workers: {
      defaultWidth: '1.2fr',
      minWidth: 150,
      cell: row => {
        const workers = workersOf(row);
        return (
          <CellText title={workers.nodes} description={workers.resources} />
        );
      },
    },
    provider: {
      defaultWidth: '1fr',
      minWidth: 90,
      cell: row => <CellText title={providerLabel(row) ?? '—'} />,
    },
    region: {
      defaultWidth: '1fr',
      minWidth: 120,
      cell: row => <CellText title={row.location ?? '—'} />,
    },
    account: {
      defaultWidth: '1.2fr',
      minWidth: 140,
      cell: row => <CellText title={row.awsAccountId ?? '—'} />,
    },
    priority: {
      defaultWidth: '1fr',
      minWidth: 130,
      cell: row => <CellText title={priorityLabel(row) ?? '—'} />,
    },
    clusterApp: {
      defaultWidth: '1fr',
      minWidth: 120,
      cell: row => <CellText title={row.appVersion ?? '—'} />,
    },
    created: {
      defaultWidth: '1fr',
      minWidth: 110,
      cell: row => {
        const created = createdOf(row, now);
        return (
          <Cell>
            <Text variant="body-medium" color="secondary" title={created?.full}>
              {created?.relative ?? '—'}
            </Text>
          </Cell>
        );
      },
    },
  };
}

/**
 * At phone width, one row per cluster: its name and state, then where it
 * runs, whose it is and its release.
 */
function ClusterStackedList({ rows }: { rows: PlatformClusterRow[] }) {
  return (
    <StackedRowList
      aria-label="Clusters"
      rows={rows.map(row => ({
        id: row.id,
        title: row.name,
        leading:
          row.type === ClusterTypes.Management ? (
            <ClusterTypeManagementIcon
              titleAccess="Management cluster"
              style={{ fontSize: 18 }}
            />
          ) : undefined,
        status: <ClusterStatusDot status={row.status} />,
        facts: [row.installationName, row.organization, row.releaseVersion],
      }))}
    />
  );
}

/**
 * The Platform page's Clusters tab: every cluster the person can read, across
 * environments, searchable, filtered by environment, organization, status
 * and release, with a column picker at the end of the filter bar and headers
 * that sort. Rows do not open anything yet. Mounted inside a
 * `PlatformClustersProvider`.
 */
export function PlatformClustersPanel() {
  const { data, unlistedInstallations } = useClustersData();
  const isLoading = usePlatformClustersLoading();
  const { visibleColumns, setVisibleColumns } = usePlatformClustersState();
  const isPhone = usePhoneLayout();
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortDescriptor>(
    PLATFORM_CLUSTERS_DEFAULT_SORT,
  );
  // One clock per render of the list, so every Created cell agrees.
  const now = useMemo(() => new Date(), [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo<PlatformClusterRow[]>(
    () =>
      data.map(cluster => ({
        ...cluster,
        id: `${cluster.installationName}/${cluster.namespace ?? ''}/${cluster.name}`,
      })),
    [data],
  );
  const searched = useMemo(() => searchRows(rows, search), [rows, search]);
  const filters = useCatalogFilters({
    items: rows,
    searched,
    facets: CLUSTER_FACETS,
  });
  const sorted = useMemo(
    () =>
      sortPlatformClusterRows(
        filters.filtered,
        isPhone ? PLATFORM_CLUSTERS_DEFAULT_SORT : sort,
      ),
    [filters.filtered, sort, isPhone],
  );

  const columnSpecs = useColumns(now);
  const columns: ColumnConfig<PlatformClusterRow>[] = (
    ['name', ...visibleColumns] as PlatformClusterColumn[]
  ).map(id => ({
    id,
    label: PLATFORM_CLUSTER_COLUMN_LABELS[id],
    isSortable: true,
    ...columnSpecs[id],
  }));

  const narrowed = search.trim() !== '' || filters.isFiltered;
  const showChrome = rows.length > 0 && isSearchableList(rows.length, narrowed);

  let body;
  if (isLoading && rows.length === 0) {
    body = <LoadingIndicator label="Reading clusters…" />;
  } else if (rows.length === 0) {
    body =
      unlistedInstallations.length > 0 ? null : (
        <EmptyStateCard
          title="No clusters yet"
          description="No environment you can read has a cluster."
        />
      );
  } else if (sorted.length === 0) {
    body = (
      <CatalogNoMatch
        plural="clusters"
        search={search}
        isFiltered={filters.isFiltered}
        onClearFilters={filters.clear}
      />
    );
  } else {
    body = (
      <ShowMore
        key={`${search.trim()}|${filters.key}|${sort.column}|${sort.direction}`}
        items={sorted}
        initial={INITIAL_ROWS}
        noun="cluster"
      >
        {page =>
          isPhone ? (
            <ClusterStackedList rows={page} />
          ) : (
            <Table<PlatformClusterRow>
              columnConfig={columns}
              data={page}
              pagination={{ type: 'none' }}
              sort={{ descriptor: sort, onSortChange: setSort }}
            />
          )
        }
      </ShowMore>
    );
  }

  return (
    <Flex direction="column" gap="4">
      {showChrome && (
        // The search on a row of its own, as on Customize: beside four
        // dropdowns it pushed them onto a second row at laptop width.
        <div style={{ maxWidth: isPhone ? undefined : 360 }}>
          <SearchField
            aria-label="Search clusters"
            placeholder="Search clusters"
            value={search}
            onChange={setSearch}
          />
        </div>
      )}
      {rows.length > 0 && (showChrome || !isPhone) && (
        // The column picker at the end of the filter bar, level with its
        // first row when the dropdowns wrap.
        <Flex align="start" gap="2">
          {showChrome && (
            <CatalogFilterBar
              dimensions={filters.dimensions}
              onSelect={filters.select}
              onClear={filters.clear}
            />
          )}
          {!isPhone && (
            <div style={{ marginLeft: 'auto', flex: 'none' }}>
              <ColumnPicker
                options={PICKER_OPTIONS}
                visible={visibleColumns}
                onChange={setVisibleColumns}
              />
            </div>
          )}
        </Flex>
      )}
      <UnlistedEnvironmentsAlert installations={unlistedInstallations} />
      {body}
    </Flex>
  );
}
