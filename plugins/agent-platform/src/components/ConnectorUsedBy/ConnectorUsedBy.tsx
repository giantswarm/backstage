import { useMemo } from 'react';
import { Alert, Text } from '@backstage/ui';
import {
  ConnectorPageTarget,
  useConnectorPageTarget,
} from '@giantswarm/backstage-plugin-muster';
import { connectorAccess } from '../../lib/connectorAccess';
import { AgentPlatformCookieAuth } from '../AgentPlatformCookieAuth';
import { AgentRow, AgentsDataProvider, useAgents } from '../AgentsDataProvider';
import { type AgentUsage, AgentUsageList } from '../AgentUsageList';
import { ModelConfigsProvider } from '../ModelConfigsProvider';
import { QueryClientProvider } from '../QueryClientProvider';

/**
 * The agents on the connector's installation whose toolset reaches it, each
 * with what its toolset lets it do there.
 */
export function agentsUsing(
  rows: AgentRow[],
  target: ConnectorPageTarget,
): { using: AgentUsage[]; unresolved: number } {
  const onInstallation = rows.filter(
    row => row.installation === target.installation,
  );
  const using: AgentUsage[] = [];
  let unresolved = 0;
  for (const row of onInstallation) {
    if (!row.toolset || row.toolset.state === 'unresolved') {
      unresolved += 1;
      continue;
    }
    const access = connectorAccess(row.toolset, target);
    if (access) {
      using.push({ row, detail: access });
    }
  }
  using.sort((a, b) => a.row.name.localeCompare(b.row.name));
  return { using, unresolved };
}

function UsedByList({ target }: { target: ConnectorPageTarget }) {
  const { rows, isLoading, unreachableInstallations } = useAgents();
  const { using, unresolved } = useMemo(
    () => agentsUsing(rows, target),
    [rows, target],
  );

  if (!isLoading && unreachableInstallations.includes(target.installation)) {
    return (
      <Alert
        status="warning"
        title="Could not read the agents"
        description={`The agents on ${target.installation} could not be listed, so it is not known which of them use this connector.`}
      />
    );
  }

  return (
    <AgentUsageList
      agents={using}
      isLoading={isLoading}
      label="Agents using this connector"
      emptyText={`No agent on ${target.installation} uses this connector.`}
    >
      {unresolved > 0 && (
        <Text as="p" variant="body-small" color="secondary">
          {unresolved === 1
            ? 'The tools of 1 more agent could not be read.'
            : `The tools of ${unresolved} more agents could not be read.`}
        </Text>
      )}
    </AgentUsageList>
  );
}

/**
 * The agents that use the connector of the page it is attached to, each with
 * what its toolset lets it do there. Renders nothing outside a connector page.
 */
export function ConnectorUsedBy() {
  const target = useConnectorPageTarget();
  if (!target) {
    return null;
  }
  return (
    <QueryClientProvider>
      <AgentPlatformCookieAuth>
        <ModelConfigsProvider>
          <AgentsDataProvider>
            <UsedByList target={target} />
          </AgentsDataProvider>
        </ModelConfigsProvider>
      </AgentPlatformCookieAuth>
    </QueryClientProvider>
  );
}
