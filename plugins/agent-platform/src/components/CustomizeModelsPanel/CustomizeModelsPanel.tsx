import { useMemo } from 'react';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import {
  Card,
  CardBody,
  Cell,
  CellText,
  ColumnConfig,
  Flex,
  Table,
  Text,
} from '@backstage/ui';
import ChevronRightIcon from '@material-ui/icons/ChevronRight';
import {
  type CatalogFacet,
  CatalogFilterBar,
  CatalogNoMatch,
  EmptyStateCard,
  InfoHint,
  INITIAL_ROWS,
  LoadingIndicator,
  ShowMore,
  StatusDot,
  useCatalogFilters,
  usePhoneColumns,
  usePhoneLayout,
} from '@giantswarm/backstage-plugin-ui-react';

import {
  agentsByModel,
  modelStatus,
  searchModels,
  usedByLabel,
} from '../../lib/customize';
import { useCustomizePaths } from '../../hooks/useCustomizePaths';
import { servingRouteRef } from '../../routes';
import { useAgents } from '../AgentsDataProvider';
import { useCustomizeData } from '../CustomizeDataProvider';
import { useModelConfigs } from '../ModelConfigsProvider';
import { ModelHostingHint } from '../ModelHostingHint';
import type { ModelRow } from '../ModelsTable';
import { hasServingLayer, useServing } from '../ServingProvider';
import { UnreachableInstallationsAlert } from '../UnreachableInstallationsAlert';

export type CustomizeModelsPanelProps = {
  search: string;
};

type Row = ModelRow & { usedBy?: string };

/** The Models tab's one facet (T49): who serves the model. */
const MODEL_FACETS: CatalogFacet<ModelRow>[] = [
  {
    id: 'provider',
    label: 'Provider',
    value: row => row.provider || undefined,
  },
];

/**
 * A model's state, and beside it the controller's reason where the verdict
 * falls short ("Not accepted" because a key Secret is missing): a hint, so
 * the label stays short enough to read in the column. The same pattern as
 * the connectors' status.
 */
function ModelStatusCell({ row }: { row: Row }) {
  const status = modelStatus(row);
  return (
    <Cell>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 'var(--bui-space-1)',
          maxWidth: '100%',
        }}
      >
        <StatusDot tone={status.tone} label={status.label} />
        {status.detail && (
          <InfoHint
            label={`About the state of ${row.displayName}`}
            size="medium"
          >
            {status.detail}
          </InfoHint>
        )}
      </span>
    </Cell>
  );
}

/** The way into model hosting, for installations with a serving layer. */
function ModelHostingBanner() {
  const servingRoute = useRouteRef(servingRouteRef);
  const servingLayer = hasServingLayer(useServing());
  if (!servingRoute || !servingLayer) {
    return null;
  }
  return (
    <Card href={servingRoute()} label="Model hosting">
      <CardBody>
        <Flex align="center" justify="between" gap="4">
          <Flex direction="column" gap="1">
            <Text as="h2" variant="body-large" weight="bold">
              Model hosting
            </Text>
            <Text variant="body-medium" color="secondary">
              Admins can run models on their own GPUs and manage what is served.
            </Text>
          </Flex>
          <ChevronRightIcon aria-hidden fontSize="small" />
        </Flex>
      </CardBody>
    </Card>
  );
}

/**
 * The Models tab of the shell's Customize screen: the model configurations in
 * scope, how many agents run on each and whether it answers, each opening the
 * model's page; filtered by provider once there is more than one (T49). Must
 * be mounted inside a `CustomizeDataProvider`.
 */
export function CustomizeModelsPanel({ search }: CustomizeModelsPanelProps) {
  const { modelRows } = useCustomizeData();
  const { isLoading, hasInstallations, unreachableInstallations } =
    useModelConfigs();
  const { rows: agents, isLoading: agentsLoading } = useAgents();
  const { modelDetail: modelDetailRoute } = useCustomizePaths();

  const usage = useMemo(() => agentsByModel(agents), [agents]);
  const searched = useMemo(
    () => searchModels(modelRows, search),
    [modelRows, search],
  );
  const filters = useCatalogFilters({
    items: modelRows,
    searched,
    facets: MODEL_FACETS,
  });
  const rows = useMemo<Row[]>(
    () =>
      filters.filtered.map(row => ({
        ...row,
        ...(agentsLoading
          ? {}
          : { usedBy: usedByLabel(usage.get(row.id) ?? 0) }),
      })),
    [filters.filtered, usage, agentsLoading],
  );
  const showInstallation =
    new Set(modelRows.map(row => row.installation)).size > 1;
  const isPhone = usePhoneLayout();

  const hrefOf = (row: Row) =>
    modelDetailRoute?.({
      installation: row.installation,
      namespace: row.namespace,
      name: row.name,
    });

  const columns: ColumnConfig<Row>[] = [
    {
      id: 'name',
      label: 'Model',
      isRowHeader: true,
      defaultWidth: '3fr',
      // The name is the row's link (M21): reachable by keyboard and opens in
      // a new tab on cmd/middle-click; the whole row stays clickable too.
      cell: row => (
        <CellText
          title={row.displayName}
          href={hrefOf(row)}
          description={[
            row.provider,
            row.model,
            ...(showInstallation ? [row.installation] : []),
            // At phone width the Used by column is hidden: its count joins
            // the name's line, "OpenAI · gpt-4o · 3 agents".
            ...(isPhone ? [row.usedBy] : []),
          ]
            .filter(Boolean)
            .join(' · ')}
        />
      ),
    },
    {
      id: 'usedBy',
      label: 'Used by',
      defaultWidth: '1fr',
      cell: row => <CellText title={row.usedBy ?? ''} />,
    },
    {
      id: 'status',
      label: 'Status',
      defaultWidth: '1fr',
      // Room for the longest label, "Not accepted", beside its dot, its
      // hint and the cell's padding: bui's 75px default minimum clipped it at
      // phone width.
      minWidth: 152,
      cell: row => <ModelStatusCell row={row} />,
    },
  ];
  // T22 C7: three columns in 343px left Used by and Status ~51px each, and
  // the status label was clipped. On a phone: the model and its status.
  const shownColumns = usePhoneColumns(columns, ['name', 'status']);

  // The provider reads on behind rows already in; the list is still loading
  // only while it has none.
  const isReading = isLoading && modelRows.length === 0;

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
          description="Connect a model for agents to run on."
        />
      );
  } else if (rows.length === 0) {
    body = (
      <CatalogNoMatch
        plural="models"
        search={search}
        isFiltered={filters.isFiltered}
        onClearFilters={filters.clear}
      />
    );
  } else {
    // A page of rows at a time: tens of models are realistic, hundreds are
    // not ruled out. Never bui's page mode, which draws its footer even at
    // three rows. Keyed on the search and filters, so a new query starts at
    // its first page.
    body = (
      <ShowMore
        key={`${search.trim()}|${filters.key}`}
        items={rows}
        initial={INITIAL_ROWS}
        noun="model"
      >
        {page => (
          <Table<Row>
            columnConfig={shownColumns}
            data={page}
            pagination={{ type: 'none' }}
            rowConfig={{ getHref: hrefOf }}
          />
        )}
      </ShowMore>
    );
  }

  return (
    <Flex direction="column" gap="5">
      <CatalogFilterBar
        dimensions={filters.dimensions}
        onSelect={filters.select}
        onClear={filters.clear}
      />
      <UnreachableInstallationsAlert
        installations={unreachableInstallations}
        resourceName="Models"
        isLoading={isReading}
      />
      {body}
      <ModelHostingBanner />
      <ModelHostingHint />
    </Flex>
  );
}
