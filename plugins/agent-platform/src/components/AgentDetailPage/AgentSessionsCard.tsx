import { Flex, Text } from '@backstage/ui';
import { Link } from '@backstage/core-components';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { InfoCard } from '@giantswarm/backstage-plugin-ui-react';

import { AgentSessionsView } from '../../hooks/useAgentSessions';
import { sessionsRouteRef } from '../../routes';
import { SessionsTable } from '../SessionsTable';

/**
 * How many sessions to show inline. Enough to answer "has anyone used this
 * agent, and did it just run"; the Sessions tab is there for the rest.
 */
const RECENT_SESSION_LIMIT = 5;

/**
 * The signed-in user's recent sessions with this agent.
 *
 * Explicitly *not* a usage metric. kagent scopes its session list to the caller,
 * so this shows only your own conversations — the prototype's "2,104 sessions
 * all-time" has no equivalent here, and inventing one from this list would be
 * wrong by orders of magnitude on a shared agent.
 */
export function AgentSessionsCard({
  sessions,
}: {
  sessions: AgentSessionsView;
}) {
  const sessionsRoute = useRouteRef(sessionsRouteRef);
  const { rows, isLoading, isNotUserScoped, isUnavailable } = sessions;

  const recent = rows.slice(0, RECENT_SESSION_LIMIT);

  return (
    <InfoCard
      title="Recent sessions"
      headerActions={
        sessionsRoute && <Link to={sessionsRoute()}>View all sessions</Link>
      }
    >
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
            rows={recent}
            isLoading={isLoading}
            hideColumns={['agentName', 'installation']}
            showSearch={false}
            showPagination={false}
            emptyMessage="No sessions with this agent yet."
          />
        )}

        {rows.length > recent.length && sessionsRoute && (
          <Text variant="body-small" color="secondary">
            Showing {recent.length} of {rows.length}.{' '}
            <Link to={sessionsRoute()}>See all in Sessions</Link>
          </Text>
        )}
      </Flex>
    </InfoCard>
  );
}
