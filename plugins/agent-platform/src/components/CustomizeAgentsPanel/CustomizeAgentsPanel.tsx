import { useMemo } from 'react';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Cell, CellText, ColumnConfig, Flex, Table, Text } from '@backstage/ui';
import {
  EmptyStateCard,
  LoadingIndicator,
  StatusDot,
} from '@giantswarm/backstage-plugin-ui-react';

import { useAgentAvatarUrl } from '../../hooks/useAgentAvatarUrl';
import type { AvatarSize } from '../../lib/agentAvatar';
import { agentParts, agentStatus, searchAgents } from '../../lib/customize';
import { agentDetailRouteRef } from '../../routes';
import { AgentAvatar } from '../AgentAvatar';
import { type AgentRow, useAgents } from '../AgentsDataProvider';
import { UnreachableInstallationsAlert } from '../UnreachableInstallationsAlert';

/** Twice the rendered 32px (bui's medium avatar), for sharp 2x displays. */
const ROW_AVATAR_SIZE: AvatarSize = 96;

export type CustomizeAgentsPanelProps = {
  search: string;
};

function AgentName({ row, avatarUrl }: { row: AgentRow; avatarUrl?: string }) {
  return (
    <Cell>
      <Flex align="center" gap="3" style={{ minWidth: 0 }}>
        <AgentAvatar
          size="medium"
          purpose="decoration"
          name={row.name}
          src={avatarUrl ?? ''}
        />
        <Flex direction="column" gap="1" style={{ minWidth: 0 }}>
          <Text variant="body-medium" weight="bold" truncate>
            {row.name}
          </Text>
          {row.description && (
            <Text variant="body-small" color="secondary" truncate>
              {row.description}
            </Text>
          )}
        </Flex>
      </Flex>
    </Cell>
  );
}

/**
 * The Agents tab of the shell's Customize screen: the agents in scope as flat
 * rows — the Connectors tab's presentation — with their model, parts and
 * state, each row opening the agent's page. Global, with no organization
 * column or filter (D4): the Kubernetes namespace an agent lives in is a
 * technical detail of its own page. Must be mounted inside a
 * `CustomizeDataProvider`.
 */
export function CustomizeAgentsPanel({ search }: CustomizeAgentsPanelProps) {
  const { rows, isLoading, hasInstallations, unreachableInstallations } =
    useAgents();
  const buildAvatarUrl = useAgentAvatarUrl();
  const agentDetailRoute = useRouteRef(agentDetailRouteRef);

  const visible = useMemo(() => searchAgents(rows, search), [rows, search]);
  const showInstallation = new Set(rows.map(row => row.installation)).size > 1;

  const columns: ColumnConfig<AgentRow>[] = [
    {
      id: 'name',
      label: 'Agent',
      isRowHeader: true,
      defaultWidth: '3fr',
      cell: row => (
        <AgentName
          row={row}
          avatarUrl={buildAvatarUrl(row.installation, row.technicalName, {
            size: ROW_AVATAR_SIZE,
          })}
        />
      ),
    },
    {
      id: 'model',
      label: 'Model',
      defaultWidth: '1.2fr',
      cell: row => <CellText title={row.model ?? ''} />,
    },
    {
      id: 'parts',
      label: 'Skills & connectors',
      defaultWidth: '1.4fr',
      cell: row => <CellText title={agentParts(row)} />,
    },
    ...(showInstallation
      ? [
          {
            id: 'installation',
            label: 'Environment',
            defaultWidth: '1fr',
            cell: (row: AgentRow) => <CellText title={row.installation} />,
          } satisfies ColumnConfig<AgentRow>,
        ]
      : []),
    {
      id: 'status',
      label: 'Status',
      defaultWidth: '1.2fr',
      cell: row => {
        const status = agentStatus(row);
        return (
          <Cell>
            <StatusDot tone={status.tone} label={status.label} />
          </Cell>
        );
      },
    },
  ];

  let body;
  if (isLoading) {
    body = <LoadingIndicator label="Reading your agents…" />;
  } else if (!hasInstallations) {
    body = (
      <EmptyStateCard
        title="No environments configured"
        description="Agents are read from your environments, and this portal knows none."
      />
    );
  } else if (rows.length === 0) {
    body =
      unreachableInstallations.length > 0 ? null : (
        <EmptyStateCard
          title="No agents yet"
          description="Create an agent to start sessions with it."
        />
      );
  } else if (visible.length === 0) {
    body = (
      <Text as="p" variant="body-medium" color="secondary">
        No agents match “{search.trim()}”.
      </Text>
    );
  } else {
    body = (
      // The table keeps its column grid at phone width; the wrapper lets it
      // scroll sideways instead of breaking the page's 375px layout.
      <div style={{ overflowX: 'auto' }}>
        <Table<AgentRow>
          columnConfig={columns}
          data={visible}
          pagination={{ type: 'none' }}
          rowConfig={{
            getHref: row =>
              agentDetailRoute?.({
                installation: row.installation,
                namespace: row.namespace,
                name: row.technicalName,
              }),
          }}
        />
      </div>
    );
  }

  return (
    <Flex direction="column" gap="4">
      <UnreachableInstallationsAlert
        installations={unreachableInstallations}
        resourceName="Agents"
      />
      {body}
    </Flex>
  );
}
