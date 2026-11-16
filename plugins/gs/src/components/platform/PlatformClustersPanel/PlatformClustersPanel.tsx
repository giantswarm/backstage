import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
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
  matchesQuery,
  ShowMore,
  StackedRowList,
  StatusDot,
  type StatusDotTone,
  UnreachableInstallationsAlert,
  useCatalogFilters,
  usePhoneLayout,
} from '@giantswarm/backstage-plugin-ui-react';
import {
  useClusterAccessStatus,
  useSignInAgain,
} from '../../../apis/clusterAccessStatus';
import {
  ClusterTypeManagementIcon,
  KubernetesIcon,
} from '../../../assets/icons/CustomIcons';
import {
  type RelatedReadFailures,
  useClustersData,
} from '../../clusters/ClustersDataProvider';
import { ClusterStatuses } from '../../clusters/ClusterStatus';
import {
  formatWorkerCpu,
  formatWorkerMemory,
  formatWorkerNodes,
  hasUnknownResources,
} from '../../clusters/nodePools';
import { ClusterTypes } from '../../clusters/utils';
import { getClusterKey } from '../../hooks/useWorkerCapacity';
import { useK8sVersionEOLDate } from '../../hooks/useK8sVersionEOLDate';
import { getKubernetesReleaseEOLStatus } from '../../utils/getKubernetesReleaseEOLStatus';
import { formatVersion } from '../../utils/helpers';
import {
  CLUSTER_STATUS_ORDER,
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
import { usePlatformClustersState } from '../PlatformClustersProvider';

const STATUS_TONES: Record<string, StatusDotTone> = {
  [ClusterStatuses.Ready]: 'success',
  [ClusterStatuses.Creating]: 'info',
  [ClusterStatuses.Deleting]: 'neutral',
};

/** Why a list that needs the portal session shows nothing while it is gone. */
const SESSION_ENDED_DESCRIPTION =
  'Your session in this browser ended. Sign in again to see them.';

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
    order: CLUSTER_STATUS_ORDER,
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

/** The text a search matches, token by token, as the shell's other lists do. */
function searchText(row: PlatformClusterRow): string {
  return [row.name, row.description, row.installationName, row.organization]
    .filter(Boolean)
    .join(' ');
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
 * The dash of a value that is not there. Where a related read failed on the
 * cluster's environment, the dash says so on hover and focus, so an empty
 * cell is not taken for a value the cluster lacks.
 */
function Missing({ failure }: { failure?: string }) {
  return (
    <Text
      variant="body-medium"
      color="secondary"
      title={failure}
      aria-label={failure}
      tabIndex={failure ? 0 : undefined}
    >
      —
    </Text>
  );
}

/**
 * A value's cell, or its dash. A function, not a component: the table needs
 * a `Cell` or `CellText` at the top of what a column returns.
 */
function valueCell(value: string | undefined, failure?: string) {
  return value ? (
    <CellText title={value} />
  ) : (
    <Cell>
      <Missing failure={failure} />
    </Cell>
  );
}

/** "Could not read the region: API unreachable (timeout)." */
function failureOf(what: string, reason: string | undefined) {
  return reason ? `Could not read the ${what}: ${reason}.` : undefined;
}

/** The Kubernetes minor version of a control plane's version, `v1.30.11` → `1.30`. */
function kubernetesMinor(version: string | undefined): string | undefined {
  return version
    ? formatVersion(version).split('.').slice(0, 2).join('.')
    : undefined;
}

/**
 * The release, then the Kubernetes minor version it runs, marked when that
 * version is past its end of life.
 */
function ReleaseFacts({
  row,
  failure,
}: {
  row: PlatformClusterRow;
  failure?: string;
}) {
  const kubernetes = kubernetesMinor(row.kubernetesVersion);
  // `gs.kubernetesVersions` is keyed by the minor version without the `v`
  // a control plane reports.
  const eolDate = useK8sVersionEOLDate(
    row.kubernetesVersion && formatVersion(row.kubernetesVersion),
  );
  const eol = getKubernetesReleaseEOLStatus(eolDate as string);
  return (
    <Flex align="center" gap="3" style={{ flexWrap: 'wrap' }}>
      {row.releaseVersion ? (
        <Text variant="body-medium">{row.releaseVersion}</Text>
      ) : (
        <Missing />
      )}
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
      {!kubernetes && failure && <Missing failure={failure} />}
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

function managementMark(row: PlatformClusterRow) {
  return row.type === ClusterTypes.Management ? (
    <ClusterTypeManagementIcon
      titleAccess="Management cluster"
      style={{ fontSize: 18 }}
    />
  ) : undefined;
}

/**
 * Each column's least width, in px, measured in fixture mode: the larger of
 * its header (the label plus 44px of sort arrow and padding) and its usual
 * content on one line — a status, a release with its Kubernetes version and
 * EOL mark, the workers' "144 vCPUs · 1152 GiB", "almost 2 years ago". The
 * default columns add up to 960px, a 1280px window's content width beside
 * the rail; past that the table scrolls sideways. Free text (the name, the
 * organization) gets less and ends in an ellipsis, the whole value on hover.
 */
const MIN_WIDTHS: Record<PlatformClusterColumn, number> = {
  name: 140,
  status: 100,
  environment: 128,
  organization: 128,
  release: 150,
  workers: 162,
  provider: 102,
  region: 100,
  account: 122,
  priority: 144,
  clusterApp: 120,
  created: 152,
};

/** One short unit on one line: a date, a count. */
const NO_WRAP = { whiteSpace: 'nowrap' } as const;

type ColumnSpec = Omit<ColumnConfig<PlatformClusterRow>, 'id' | 'label'>;

/**
 * Every column of the list, built once per clock and per set of failed related
 * reads, so the table keeps its column identities between renders.
 */
function buildColumnSpecs(
  now: Date,
  failures: Record<string, RelatedReadFailures>,
): Record<PlatformClusterColumn, ColumnSpec> {
  const failed = (row: PlatformClusterRow) =>
    failures[row.installationName] ?? {};
  return {
    name: {
      isRowHeader: true,
      defaultWidth: '2fr',
      minWidth: MIN_WIDTHS.name,
      cell: row => (
        <CellText
          title={row.name}
          description={row.description}
          leadingIcon={managementMark(row)}
        />
      ),
    },
    status: {
      defaultWidth: '1fr',
      minWidth: MIN_WIDTHS.status,
      cell: row => (
        <Cell>
          <ClusterStatusDot status={row.status} />
        </Cell>
      ),
    },
    environment: {
      defaultWidth: '1fr',
      minWidth: MIN_WIDTHS.environment,
      cell: row => <CellText title={row.installationName} />,
    },
    organization: {
      defaultWidth: '1fr',
      minWidth: MIN_WIDTHS.organization,
      cell: row => valueCell(row.organization),
    },
    release: {
      defaultWidth: '1.4fr',
      minWidth: MIN_WIDTHS.release,
      cell: row => (
        <Cell>
          <ReleaseFacts
            row={row}
            failure={failureOf('Kubernetes version', failed(row).controlPlanes)}
          />
        </Cell>
      ),
    },
    workers: {
      defaultWidth: '1.2fr',
      minWidth: MIN_WIDTHS.workers,
      cell: row => {
        const workers = workersOf(row);
        return (
          <CellText title={workers.nodes} description={workers.resources} />
        );
      },
    },
    provider: {
      defaultWidth: '1fr',
      minWidth: MIN_WIDTHS.provider,
      cell: row => valueCell(providerLabel(row)),
    },
    region: {
      defaultWidth: '1fr',
      minWidth: MIN_WIDTHS.region,
      cell: row =>
        valueCell(
          row.location,
          failureOf('region', failed(row).providerClusters),
        ),
    },
    account: {
      defaultWidth: '1.2fr',
      minWidth: MIN_WIDTHS.account,
      cell: row =>
        valueCell(
          row.awsAccountId,
          failureOf(
            'account',
            failed(row).providerClusters ?? failed(row).identities,
          ),
        ),
    },
    priority: {
      defaultWidth: '1fr',
      minWidth: MIN_WIDTHS.priority,
      cell: row => valueCell(priorityLabel(row)),
    },
    clusterApp: {
      defaultWidth: '1fr',
      minWidth: MIN_WIDTHS.clusterApp,
      cell: row =>
        valueCell(
          row.appVersion,
          failureOf('cluster app version', failed(row).providerClusters),
        ),
    },
    created: {
      defaultWidth: '1fr',
      minWidth: MIN_WIDTHS.created,
      cell: row =>
        row.created ? (
          <Cell>
            <Text
              variant="body-medium"
              color="secondary"
              title={formatLocalDateFull(row.created)}
              style={NO_WRAP}
            >
              {getRelativeDate(row.created, now)}
            </Text>
          </Cell>
        ) : (
          <Cell>
            <Missing />
          </Cell>
        ),
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
        leading: managementMark(row),
        status: <ClusterStatusDot status={row.status} />,
        facts: [row.installationName, row.organization, row.releaseVersion],
      }))}
    />
  );
}

/**
 * The environments whose clusters could not be read, as the shell's other
 * lists name theirs, with a sign-in where one expired. With no cluster to
 * show it is the list's answer, a danger card; otherwise a warning above the
 * list once every environment has answered.
 */
function UnlistedEnvironments({ everything }: { everything: boolean }) {
  const { unlistedInstallations, isReadingClusters, retry } = useClustersData();
  const access = useClusterAccessStatus();
  const signInAgain = useSignInAgain();
  const failures = useMemo(
    () =>
      Object.fromEntries(
        unlistedInstallations.map(({ installation, reason }) => [
          installation,
          { reason },
        ]),
      ),
    [unlistedInstallations],
  );
  const expired = unlistedInstallations.some(({ installation }) =>
    access.some(
      entry =>
        entry.installation === installation &&
        entry.state === 'session-expired',
    ),
  );
  return (
    <UnreachableInstallationsAlert
      installations={unlistedInstallations.map(
        ({ installation }) => installation,
      )}
      failures={failures}
      resourceName="clusters"
      isLoading={isReadingClusters}
      onRetry={retry}
      everything={
        everything ? { title: 'Could not read your clusters' } : undefined
      }
      actions={
        expired ? (
          <Button size="small" variant="secondary" onPress={signInAgain}>
            Sign in again
          </Button>
        ) : undefined
      }
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
  const { data, relatedReadFailures } = useClustersData();
  const {
    status,
    installationsError,
    retryInstallations,
    visibleColumns,
    setVisibleColumns,
  } = usePlatformClustersState();
  const isPhone = usePhoneLayout();
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortDescriptor>(
    PLATFORM_CLUSTERS_DEFAULT_SORT,
  );

  const rows = useMemo<PlatformClusterRow[]>(
    () => data.map(cluster => ({ ...cluster, id: getClusterKey(cluster) })),
    [data],
  );
  const searched = useMemo(
    () => rows.filter(row => matchesQuery(search, searchText(row))),
    [rows, search],
  );
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

  // One clock per read of the list, so every Created cell agrees.
  const now = useMemo(() => new Date(), [data]); // eslint-disable-line react-hooks/exhaustive-deps
  const columnSpecs = useMemo(
    () => buildColumnSpecs(now, relatedReadFailures),
    [now, relatedReadFailures],
  );
  const columns = useMemo<ColumnConfig<PlatformClusterRow>[]>(
    () =>
      (['name', ...visibleColumns] as PlatformClusterColumn[]).map(id => ({
        id,
        label: PLATFORM_CLUSTER_COLUMN_LABELS[id],
        isSortable: true,
        ...columnSpecs[id],
      })),
    [columnSpecs, visibleColumns],
  );

  if (status === 'loading') {
    return <LoadingIndicator label="Reading clusters…" />;
  }
  if (status === 'session-ended') {
    return (
      <EmptyStateCard
        title="Could not read your clusters"
        description={SESSION_ENDED_DESCRIPTION}
      />
    );
  }
  if (status === 'installations-failed') {
    return (
      <Alert
        role="alert"
        status="danger"
        title="Could not read your environments"
        description={`The environments the clusters are read from could not be listed${
          installationsError?.message ? `: ${installationsError.message}` : ''
        }`}
        customActions={
          <Button size="small" variant="secondary" onPress={retryInstallations}>
            Try again
          </Button>
        }
      />
    );
  }
  if (status === 'no-installations') {
    return (
      <EmptyStateCard
        title="No environments to read"
        description="Clusters are read from your environments, and none is configured or switched on."
      />
    );
  }
  if (status === 'failed') {
    return <UnlistedEnvironments everything />;
  }
  if (status === 'empty') {
    return (
      <EmptyStateCard
        title="No clusters yet"
        description="None of your environments has a cluster."
      />
    );
  }

  const narrowed = search.trim() !== '' || filters.isFiltered;
  const showChrome = isSearchableList(rows.length, narrowed);

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
      {(showChrome || !isPhone) && (
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
      <UnlistedEnvironments everything={false} />
      {sorted.length === 0 ? (
        <CatalogNoMatch
          plural="clusters"
          search={search}
          isFiltered={filters.isFiltered}
          onClearFilters={filters.clear}
        />
      ) : (
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
      )}
    </Flex>
  );
}
