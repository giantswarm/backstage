import { Button, Flex, Text } from '@backstage/ui';
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
 *
 * With no sessions there is nothing to search, sort or page, so the table gives
 * way to the one thing to do next: start one, when the agent is ready.
 */
export function AgentSessionsCard({
  sessions,
  onStartSession,
}: {
  sessions: AgentSessionsView;
  /** Opens the new-session dialog. Absent while the agent is not ready. */
  onStartSession?: () => void;
}) {
  const { rows, installation, isLoading, isNotUserScoped, isUnavailable } =
    sessions;
  // The same summary the Sessions tab reads, under the same query key: opening
  // this card after that tab costs nothing, and this page's read warms it back.
  const sessionStates = useFleetSessionStates(
    rows.length ? [installation] : [],
  );

  if (isUnavailable) {
    return (
      <InfoCard title="Sessions">
        <Text variant="body-medium" color="secondary">
          Sessions could not be read from this installation.
        </Text>
      </InfoCard>
    );
  }

  if (!isLoading && rows.length === 0) {
    return (
      <InfoCard title="Sessions">
        <Flex direction="column" gap="3" align="start">
          <Text variant="body-medium" color="secondary">
            {isNotUserScoped
              ? 'No one has started a session with this agent yet.'
              : "You haven't started a session with this agent yet."}
          </Text>
          {onStartSession && (
            <Button variant="primary" onPress={onStartSession}>
              Start a session
            </Button>
          )}
        </Flex>
      </InfoCard>
    );
  }

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

        <SessionsTable
          rows={rows}
          sessionStates={sessionStates}
          isLoading={isLoading}
          hideColumns={['agentName', 'installation']}
        />
      </Flex>
    </InfoCard>
  );
}
