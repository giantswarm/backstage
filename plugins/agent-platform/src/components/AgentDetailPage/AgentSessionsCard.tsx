import { Flex, Text } from '@backstage/ui';
import { InfoCard } from '@giantswarm/backstage-plugin-ui-react';

import { AgentSessionsView } from '../../hooks/useAgentSessions';
import { useFleetSessionStates } from '../../hooks/useFleetSessionStates';
import { SessionsTable } from '../SessionsTable';

/**
 * The signed-in user's sessions with this agent.
 *
 * Explicitly *not* a usage metric. kagent scopes its session list to the caller,
 * so this shows only your own conversations — the prototype's "2,104 sessions
 * all-time" has no equivalent here, and inventing one from this list would be
 * wrong by orders of magnitude on a shared agent.
 *
 * The whole list, searchable and paged: this is a tab of its own, and the five
 * rows it showed while it was one section of a scrolling page were a teaser for
 * a page that does not exist — the section's Sessions tab lists every agent's,
 * not this agent's, so it is not the "rest" of this list and is not linked here.
 */
export function AgentSessionsCard({
  sessions,
}: {
  sessions: AgentSessionsView;
}) {
  const { rows, installation, isLoading, isNotUserScoped, isUnavailable } =
    sessions;
  // The same summary the Sessions tab reads, under the same query key: opening
  // this card after that tab costs nothing, and this page's read warms it back.
  const sessionStates = useFleetSessionStates(
    rows.length ? [installation] : [],
  );

  return (
    <InfoCard title="Sessions">
      <Flex direction="column" gap="3">
        <Text variant="body-small" color="secondary">
          {isNotUserScoped
            ? // Not a caveat we can hide: on an installation running kagent in
              // `unsecure` mode the list is everyone's, so calling it "yours"
              // would be a lie in the other direction.
              "This installation's kagent does not scope sessions to a user, so these are everyone's sessions with this agent."
            : 'Your own sessions with this agent. kagent only lets you read sessions you started, so this is not a usage total.'}
        </Text>

        {isUnavailable ? (
          <Text variant="body-medium" color="secondary">
            Sessions could not be read from this installation.
          </Text>
        ) : (
          <SessionsTable
            rows={rows}
            sessionStates={sessionStates}
            isLoading={isLoading}
            hideColumns={['agentName', 'installation']}
            emptyMessage="No sessions with this agent yet. Conversations from before the move to kagent API v2 are not available."
          />
        )}
      </Flex>
    </InfoCard>
  );
}
