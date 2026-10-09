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
  LoadingIndicator,
  StatusDot,
} from '@giantswarm/backstage-plugin-ui-react';

import {
  agentsByModel,
  inOrganization,
  modelStatus,
  searchModels,
  usedByLabel,
} from '../../lib/customize';
import { modelDetailRouteRef, servingRouteRef } from '../../routes';
import { useAgents } from '../AgentsDataProvider';
import { useCustomizeData } from '../CustomizeDataProvider';
import { useModelConfigs } from '../ModelConfigsProvider';
import type { ModelRow } from '../ModelsTable';
import { hasServingLayer, useServing } from '../ServingProvider';
import { UnreachableInstallationsAlert } from '../UnreachableInstallationsAlert';

export type CustomizeModelsPanelProps = {
  search: string;
  /** The organization (namespace) to show, or `'all'`. */
  organization: string;
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
export function CustomizeModelsPanel({
  search,
  organization,
}: CustomizeModelsPanelProps) {
  const { modelRows } = useCustomizeData();
  const { isLoading, hasInstallations, unreachableInstallations } =
    useModelConfigs();
  const { rows: agents, isLoading: agentsLoading } = useAgents();
  const modelDetailRoute = useRouteRef(modelDetailRouteRef);

  const usage = useMemo(() => agentsByModel(agents), [agents]);
  const rows = useMemo<Row[]>(
    () =>
      searchModels(inOrganization(modelRows, organization), search).map(
        row => ({
          ...row,
          ...(agentsLoading
            ? {}
            : { usedBy: usedByLabel(usage.get(row.id) ?? 0) }),
        }),
      ),
    [modelRows, organization, search, usage, agentsLoading],
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
        {search.trim()
          ? `No models match “${search.trim()}”.`
          : 'No models in this organization.'}
      </Text>
    );
  } else {
    body = (
      <Table<Row>
        columnConfig={columns}
        data={rows}
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
    </Flex>
  );
}
