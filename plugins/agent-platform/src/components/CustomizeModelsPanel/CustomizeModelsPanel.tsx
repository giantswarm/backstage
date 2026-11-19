import { type CSSProperties, useCallback, useMemo } from 'react';
import {
  Badge,
  Cell,
  ColumnConfig,
  Flex,
  Link,
  Table,
  Text,
  useTable,
} from '@backstage/ui';
import {
  CatalogFilterBar,
  CatalogNoMatch,
  EmptyStateCard,
  type FittingTier,
  LoadingIndicator,
  StackedRowList,
  type StackedRowItem,
  StatusDot,
  StatusHint,
  useCatalogFilters,
  useFittingColumns,
  UnreachableInstallationsAlert,
} from '@giantswarm/backstage-plugin-ui-react';

import {
  agentsByModel,
  searchModels,
  usedByCell,
  usedByLabel,
} from '../../lib/customize';
import { useCustomizePaths } from '../../hooks/useCustomizePaths';
import { useSortOnShownColumn } from '../../hooks/useSortOnShownColumn';
import { useAgents } from '../AgentsDataProvider';
import { useCustomizeData } from '../CustomizeDataProvider';
import { useModelConfigs } from '../ModelConfigsProvider';
import { useOrganizationDirectory } from '../OrganizationDirectoryProvider';
import {
  MODEL_FACETS,
  MODELS_DEFAULT_SORT,
  type ModelListRow,
  sortModelRows,
  toModelListRow,
  withResourceNames,
} from './modelListRows';

export type CustomizeModelsPanelProps = {
  search: string;
};

type Row = ModelListRow;

/**
 * Each column's minimum: its header with the sort arrow and the cell's
 * padding, and its usual value whole ("Gemini on Vertex AI", "Not accepted"
 * beside its dot and hint). Together about 820px: every column fits beside
 * the side rail from about 1160px.
 */
const MODEL_COLUMN_MIN_WIDTHS = {
  name: 180,
  owner: 120,
  provider: 140,
  installation: 130,
  usedBy: 100,
  status: 152,
} as const;

/** Left out first; their values join the model id under the name. */
const MODEL_COLUMNS_DROPPED_FIRST = ['owner', 'installation'] as const;

const NOWRAP: CSSProperties = { whiteSpace: 'nowrap' };

/** What the line under a model's name says, besides the model id. */
function factsOf(row: Row, withOwner: boolean): string[] {
  return [
    row.model,
    ...(row.resourceName ? [row.resourceName] : []),
    ...(withOwner ? [row.owner, row.installation] : []),
  ].filter(Boolean);
}

/** "The default model of Platform on fennel: new agents there start with it." */
function DefaultBadge({ row }: { row: Row }) {
  return (
    <span
      title={`The default model of ${row.owner} on ${row.installation}: new agents there start with it.`}
      style={{ flex: 'none', display: 'inline-flex' }}
    >
      <Badge size="small">Default</Badge>
    </span>
  );
}

/**
 * The model: its name as the row's link with the Default badge beside it,
 * and the model id under it, then the owner and environment where their
 * columns are left out.
 */
function ModelCell({
  row,
  href,
  withOwner,
}: {
  row: Row;
  href?: string;
  withOwner: boolean;
}) {
  const facts = factsOf(row, withOwner).join(' · ');
  return (
    <Cell>
      <Flex direction="column" gap="0.5" style={{ minWidth: 0 }}>
        <Flex align="center" gap="2" style={{ minWidth: 0 }}>
          {href ? (
            <Link
              href={href}
              variant="body-medium"
              truncate
              title={row.displayName}
            >
              {row.displayName}
            </Link>
          ) : (
            <Text variant="body-medium" truncate title={row.displayName}>
              {row.displayName}
            </Text>
          )}
          {row.isDefault && <DefaultBadge row={row} />}
        </Flex>
        <Text variant="body-medium" color="secondary" truncate title={facts}>
          {facts}
        </Text>
      </Flex>
    </Cell>
  );
}

/**
 * The owner: an organization or the platform as it reads, a namespace that
 * is no organization by its name, stepped back, and saying so on hover.
 */
function OwnerCell({ row }: { row: Row }) {
  return (
    <Cell>
      <Text
        as="p"
        variant="body-medium"
        color={row.ownerIsNamespace ? 'secondary' : 'primary'}
        truncate
        title={
          row.ownerIsNamespace
            ? `Namespace ${row.owner}, no organization`
            : row.owner
        }
      >
        {row.owner}
      </Text>
    </Cell>
  );
}

/** "3 agents", or a dash for none; nothing while the agents are read. */
function UsedByCell({ row }: { row: Row }) {
  if (row.usedCount === undefined) {
    return <Cell />;
  }
  const { label, title } = usedByCell(row.usedCount, 'model');
  return (
    <Cell>
      <Text
        as="p"
        variant="body-medium"
        color={title ? 'secondary' : 'primary'}
        title={title}
        style={NOWRAP}
      >
        {label}
      </Text>
    </Cell>
  );
}

/**
 * A model's state, and beside it the controller's reason where the verdict
 * falls short ("Incomplete" because a key Secret is missing): a hint, so
 * the label stays short enough to read in the column. The connectors'
 * status layout: the dot and label, then the `StatusHint`, 4px apart, the
 * pair never shrinking.
 */
function ModelStatus({ row }: { row: Row }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--bui-space-1)',
        flex: 'none',
      }}
    >
      <StatusDot tone={row.status.tone} label={row.status.label} />
      <StatusHint subject={row.displayName} explanation={row.status.detail} />
    </span>
  );
}

/**
 * The Models tab of the shell's Customize screen: every model configuration
 * in scope, one row each, by model, with its owner, provider, environment,
 * how many agents run on it and whether it answers, each opening the model's
 * page; filtered by owner, provider, status and use. Must be mounted inside
 * a `CustomizeDataProvider`.
 *
 * Every column while their minimums fit; without Owner and Environment,
 * named under the model id, below that; a stacked row per model below that
 * and at phone width. The table never scrolls sideways.
 */
export function CustomizeModelsPanel({ search }: CustomizeModelsPanelProps) {
  const { modelRows } = useCustomizeData();
  const { isLoading, hasInstallations, unreachableInstallations } =
    useModelConfigs();
  const { rows: agents, isLoading: agentsLoading } = useAgents();
  const { modelDetail: modelDetailRoute } = useCustomizePaths();
  const { directory } = useOrganizationDirectory();

  const usage = useMemo(() => agentsByModel(agents), [agents]);
  const listRows = useMemo<Row[]>(
    () =>
      withResourceNames(
        modelRows.map(row =>
          toModelListRow(
            row,
            directory,
            agentsLoading ? undefined : (usage.get(row.id) ?? 0),
          ),
        ),
      ),
    [modelRows, directory, usage, agentsLoading],
  );
  const searched = useMemo(
    () => searchModels(listRows, search),
    [listRows, search],
  );
  const filters = useCatalogFilters({
    items: listRows,
    searched,
    facets: MODEL_FACETS,
  });

  const { tableProps } = useTable<Row>({
    mode: 'complete',
    data: filters.filtered,
    sortFn: sortModelRows,
    initialSort: MODELS_DEFAULT_SORT,
    // Every model at once: no pages, no "Show more".
    paginationOptions: { type: 'none' },
  });

  const hrefOf = useCallback(
    (row: Row) =>
      modelDetailRoute?.({
        installation: row.installation,
        namespace: row.namespace,
        name: row.name,
      }),
    [modelDetailRoute],
  );

  const columnsFor = useCallback(
    (tier: FittingTier): ColumnConfig<Row>[] => [
      {
        id: 'name',
        label: 'Model',
        isRowHeader: true,
        isSortable: true,
        defaultWidth: '2.6fr',
        // The name is the row's link (M21): reachable by keyboard and opens
        // in a new tab on cmd/middle-click; the whole row stays clickable too.
        cell: row => (
          <ModelCell row={row} href={hrefOf(row)} withOwner={tier !== 'full'} />
        ),
      },
      {
        id: 'owner',
        label: 'Owner',
        isSortable: true,
        defaultWidth: '1.9fr',
        cell: row => <OwnerCell row={row} />,
      },
      {
        id: 'provider',
        label: 'Provider',
        isSortable: true,
        defaultWidth: '1.7fr',
        cell: row => (
          <Cell>
            <Text
              as="p"
              variant="body-medium"
              truncate
              title={row.providerName}
            >
              {row.providerName}
            </Text>
          </Cell>
        ),
      },
      {
        id: 'installation',
        label: 'Environment',
        isSortable: true,
        defaultWidth: '1.2fr',
        cell: row => (
          <Cell>
            <Text
              as="p"
              variant="body-medium"
              truncate
              title={row.installation}
            >
              {row.installation}
            </Text>
          </Cell>
        ),
      },
      {
        id: 'usedBy',
        label: 'Used by',
        isSortable: true,
        defaultWidth: '1fr',
        cell: row => <UsedByCell row={row} />,
      },
      {
        id: 'status',
        label: 'Status',
        isSortable: true,
        defaultWidth: '1.6fr',
        cell: row => (
          <Cell>
            <ModelStatus row={row} />
          </Cell>
        ),
      },
    ],
    [hrefOf],
  );
  const fit = useFittingColumns(columnsFor, {
    minWidths: MODEL_COLUMN_MIN_WIDTHS,
    dropFirst: MODEL_COLUMNS_DROPPED_FIRST,
  });
  // Narrow, Owner and Environment are hidden: a sort on them goes to Model.
  useSortOnShownColumn(tableProps.sort, fit.columns, MODELS_DEFAULT_SORT);

  // The stacked rows have no headers to show or change a sort with: they
  // stay in the default order. Provider is left out of their facts (four at
  // most): it is on the model's page, and the Provider filter finds it.
  const stackedRows = useMemo<StackedRowItem[]>(
    () =>
      fit.isCompact
        ? sortModelRows(filters.filtered, MODELS_DEFAULT_SORT).map(row => {
            const href = hrefOf(row);
            return {
              id: row.id,
              title: row.displayName,
              ...(href ? { href } : {}),
              status: (
                <Flex align="center" gap="2">
                  {row.isDefault && <DefaultBadge row={row} />}
                  <ModelStatus row={row} />
                </Flex>
              ),
              facts: [
                ...factsOf(row, true),
                // No header says "Used by" here: the fact says it itself.
                row.usedCount === undefined
                  ? undefined
                  : usedByLabel(row.usedCount),
              ],
            };
          })
        : [],
    [fit.isCompact, filters.filtered, hrefOf],
  );

  // The provider reads on behind rows already in; the list is still loading
  // only while it has none.
  const isReading = isLoading && modelRows.length === 0;
  const shown = filters.filtered.length;

  let body;
  if (isReading) {
    body = <LoadingIndicator label="Reading your models…" />;
  } else if (!hasInstallations) {
    body = (
      <EmptyStateCard
        title="No environments configured"
        description="Models are read from your environments, and this portal knows none."
      />
    );
  } else if (modelRows.length === 0) {
    body =
      unreachableInstallations.length > 0 ? null : (
        <EmptyStateCard
          title="No models yet"
          description="Add a model for agents to run on."
        />
      );
  } else if (shown === 0) {
    body = (
      <CatalogNoMatch
        plural="models"
        search={search}
        isFiltered={filters.isFiltered}
        onClearFilters={filters.clear}
      />
    );
  } else if (fit.isCompact) {
    body = <StackedRowList aria-label="Models" rows={stackedRows} />;
  } else {
    body = (
      <Table<Row>
        {...tableProps}
        aria-label="Models"
        columnConfig={fit.columns}
        rowConfig={{ getHref: hrefOf }}
      />
    );
  }

  return (
    <Flex direction="column" gap="5">
      <CatalogFilterBar
        dimensions={filters.dimensions}
        onSelect={filters.select}
        // While nothing matches, the message below offers the way back: one
        // "Clear filters", not two.
        onClear={shown > 0 ? filters.clear : undefined}
      />
      <UnreachableInstallationsAlert
        installations={unreachableInstallations}
        resourceName="models"
        isLoading={isReading}
      />
      {/* Measured whatever it holds, so the layout is known before the
          rows arrive. */}
      <div ref={fit.ref}>{body}</div>
    </Flex>
  );
}
