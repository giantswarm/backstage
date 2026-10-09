import { useMemo } from 'react';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Alert, Flex, List, ListRow, Text } from '@backstage/ui';
import { LoadingIndicator } from '@giantswarm/backstage-plugin-ui-react';
import {
  ConnectorPageTarget,
  useConnectorPageTarget,
} from '@giantswarm/backstage-plugin-muster';
import { useAgentAvatarUrl } from '../../hooks/useAgentAvatarUrl';
import { connectorAccess } from '../../lib/connectorAccess';
import { agentDetailRouteRef } from '../../routes';
import { AgentAvatar } from '../AgentAvatar';
import { AgentPlatformCookieAuth } from '../AgentPlatformCookieAuth';
import { AgentRow, AgentsDataProvider, useAgents } from '../AgentsDataProvider';
import { ModelConfigsProvider } from '../ModelConfigsProvider';
import { QueryClientProvider } from '../QueryClientProvider';

const AVATAR_SIZE = 96;

type UsingAgent = { row: AgentRow; access: string };

/** The agents on the connector's installation whose toolset reaches it. */
export function agentsUsing(
  rows: AgentRow[],
  target: ConnectorPageTarget,
): { using: UsingAgent[]; unresolved: number } {
  const onInstallation = rows.filter(
    row => row.installation === target.installation,
  );
  const using: UsingAgent[] = [];
  let unresolved = 0;
  for (const row of onInstallation) {
    if (!row.toolset || row.toolset.state === 'unresolved') {
      unresolved += 1;
      continue;
    }
    const access = connectorAccess(row.toolset, target);
    if (access) {
      using.push({ row, access });
    }
  }
  using.sort((a, b) => a.row.name.localeCompare(b.row.name));
  return { using, unresolved };
}

function UsedByList({ target }: { target: ConnectorPageTarget }) {
  const { rows, isLoading, unreachableInstallations } = useAgents();
  const buildAvatarUrl = useAgentAvatarUrl();
  const agentDetailRoute = useRouteRef(agentDetailRouteRef);
  const { using, unresolved } = useMemo(
    () => agentsUsing(rows, target),
    [rows, target],
  );

  if (isLoading) {
    return <LoadingIndicator label="Reading the agents…" />;
  }
  if (unreachableInstallations.includes(target.installation)) {
    return (
      <Alert
        status="warning"
        title="The agents could not be read"
        description={`The agents on ${target.installation} could not be listed, so it is not known which of them use this connector.`}
      />
    );
  }

  return (
    <Flex direction="column" gap="3">
      {using.length === 0 ? (
        <Text as="p" variant="body-medium" color="secondary">
          No agent on {target.installation} uses this connector.
        </Text>
      ) : (
        <List aria-label="Agents using this connector">
          {using.map(({ row, access }) => (
            <ListRow
              key={row.id}
              id={row.id}
              href={agentDetailRoute?.({
                installation: row.installation,
                namespace: row.namespace,
                name: row.technicalName,
              })}
              icon={
                <AgentAvatar
                  size="small"
                  purpose="decoration"
                  name={row.name}
                  src={
                    buildAvatarUrl(row.installation, row.technicalName, {
                      size: AVATAR_SIZE,
                    }) ?? ''
                  }
                />
              }
              customActions={
                <Text variant="body-small" color="secondary">
                  {access}
                </Text>
              }
            >
              {row.name}
            </ListRow>
          ))}
        </List>
      )}
      {unresolved > 0 && (
        <Text as="p" variant="body-small" color="secondary">
          {unresolved === 1
            ? 'The tools of 1 more agent could not be read.'
            : `The tools of ${unresolved} more agents could not be read.`}
        </Text>
      )}
    </Flex>
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
