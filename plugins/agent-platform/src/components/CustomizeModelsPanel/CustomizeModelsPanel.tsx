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
  EmptyStateCard,
  INITIAL_ROWS,
  LoadingIndicator,
  ShowMore,
  StatusDot,
} from '@giantswarm/backstage-plugin-ui-react';

import {
  agentsByModel,
  modelStatus,
  searchModels,
  usedByLabel,
} from '../../lib/customize';
import { modelDetailRouteRef, servingRouteRef } from '../../routes';
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
              Run models on your own GPUs and manage what is served. For admins.
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
 * model's page. Must be mounted inside a `CustomizeDataProvider`.
 */
export function CustomizeModelsPanel({ search }: CustomizeModelsPanelProps) {
  const { modelRows } = useCustomizeData();
  const { isLoading, hasInstallations, unreachableInstallations } =
    useModelConfigs();
  const { rows: agents, isLoading: agentsLoading } = useAgents();
  const modelDetailRoute = useRouteRef(modelDetailRouteRef);

  const usage = useMemo(() => agentsByModel(agents), [agents]);
  const rows = useMemo<Row[]>(
    () =>
      searchModels(modelRows, search).map(row => ({
        ...row,
        ...(agentsLoading
          ? {}
          : { usedBy: usedByLabel(usage.get(row.id) ?? 0) }),
      })),
    [modelRows, search, usage, agentsLoading],
  );
  const showInstallation =
    new Set(modelRows.map(row => row.installation)).size > 1;

  const columns: ColumnConfig<Row>[] = [
    {
      id: 'name',
      label: 'Model',
      isRowHeader: true,
      defaultWidth: '3fr',
      cell: row => (
        <CellText
          title={row.displayName}
          description={[
            row.provider,
            row.model,
            ...(showInstallation ? [row.installation] : []),
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
      cell: row => {
        const status = modelStatus(row);
        return (
          <Cell>
            <StatusDot tone={status.tone} label={status.label} />
          </Cell>
        );
      },
    },
  ];

  let body;
  if (isLoading && modelRows.length === 0) {
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
  } else if (rows.length === 0) {
    body = (
      <Text as="p" variant="body-medium" color="secondary">
        No models match “{search.trim()}”.
      </Text>
    );
  } else {
    // A page of rows at a time: tens of models are realistic, hundreds are
    // not ruled out. Never bui's page mode, which draws its footer even at
    // three rows. Keyed on the search, so a new query starts at its first page.
    body = (
      <ShowMore
        key={search.trim()}
        items={rows}
        initial={INITIAL_ROWS}
        noun="model"
      >
        {page => (
          <Table<Row>
            columnConfig={columns}
            data={page}
            pagination={{ type: 'none' }}
            rowConfig={{
              getHref: row =>
                modelDetailRoute?.({
                  installation: row.installation,
                  namespace: row.namespace,
                  name: row.name,
                }),
            }}
          />
        )}
      </ShowMore>
    );
  }

  return (
    <Flex direction="column" gap="5">
      <UnreachableInstallationsAlert
        installations={unreachableInstallations}
        resourceName="Models"
      />
      {body}
      <ModelHostingBanner />
      <ModelHostingHint />
    </Flex>
  );
}
