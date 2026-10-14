import { useMemo } from 'react';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Alert, Flex, Link, List, ListRow, Text } from '@backstage/ui';
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
import { ShowMore, USED_BY_ROWS } from '../ShowMore';

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
        title="Could not read the agents"
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
        <ShowMore items={using} initial={USED_BY_ROWS} noun="agent" revealAll>
          {shown => (
            <List aria-label="Agents using this connector">
              {shown.map(({ row, access }) => {
                // The agent's page; its installation is in the path.
                const href = agentDetailRoute?.({
                  installation: row.installation,
                  namespace: row.namespace,
                  name: row.technicalName,
                });
                return (
                  <ListRow
                    key={row.id}
                    id={row.id}
                    href={href}
                    textValue={row.name}
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
                    {/* A real link on the name, as the shell's rows have: the
                      row's own href navigates on a press but is no anchor to
                      open in a new tab or read on hover. */}
                    {href ? <Link href={href}>{row.name}</Link> : row.name}
                  </ListRow>
                );
              })}
            </List>
          )}
        </ShowMore>
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
