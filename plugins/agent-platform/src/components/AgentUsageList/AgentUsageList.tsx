import type { ReactNode } from 'react';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Flex, Link, List, ListRow, Text } from '@backstage/ui';
import {
  LoadingIndicator,
  usePhoneLayout,
} from '@giantswarm/backstage-plugin-ui-react';
import { useAgentAvatarUrl } from '../../hooks/useAgentAvatarUrl';
import { agentDetailRouteRef } from '../../routes';
import { AgentAvatar } from '../AgentAvatar';
import type { AgentRow } from '../AgentsDataProvider';
import { ShowMore, USED_BY_ROWS } from '../ShowMore';

const AVATAR_SIZE = 96;

/** One agent that uses the thing the page is about, and how. */
export type AgentUsage = {
  row: AgentRow;
  /** A short line on how it uses it, e.g. "Read-only tools". */
  detail?: string;
};

export type AgentUsageListProps = {
  /** The using agents, in the order to list them. */
  agents: AgentUsage[];
  /** The list's accessible name, e.g. "Agents using this connector". */
  label: string;
  /** What to say when no agent uses it. */
  emptyText: string;
  isLoading?: boolean;
  /** Lines under the list, e.g. the agents that could not be read. */
  children?: ReactNode;
};

/**
 * The agents using a connector or a skill, as their pages' Used by tabs list
 * them: each with its avatar and its name linking to its page, and how it uses
 * the thing at the row's end. Windowed (`ShowMore`), since a popular one can
 * be used by hundreds of agents.
 *
 * At phone width the detail goes under the name instead: at the row's end it
 * squeezed the agent's name to ~130px.
 */
export function AgentUsageList({
  agents,
  label,
  emptyText,
  isLoading,
  children,
}: AgentUsageListProps) {
  const isPhone = usePhoneLayout();
  const buildAvatarUrl = useAgentAvatarUrl();
  const agentDetailRoute = useRouteRef(agentDetailRouteRef);

  if (isLoading) {
    return <LoadingIndicator label="Reading the agents…" />;
  }

  return (
    <Flex direction="column" gap="3">
      {agents.length === 0 ? (
        <Text as="p" variant="body-medium" color="secondary">
          {emptyText}
        </Text>
      ) : (
        <ShowMore items={agents} initial={USED_BY_ROWS} noun="agent" revealAll>
          {shown => (
            <List aria-label={label}>
              {shown.map(({ row, detail }) => {
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
                    description={isPhone ? detail : undefined}
                    customActions={
                      !isPhone && detail ? (
                        <Text variant="body-small" color="secondary">
                          {detail}
                        </Text>
                      ) : undefined
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
      {children}
    </Flex>
  );
}
