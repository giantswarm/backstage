import { ReactNode } from 'react';
import { Button, Flex, Text } from '@backstage/ui';
import { InfoCard } from '@giantswarm/backstage-plugin-ui-react';

import { AgentSessionsView } from '../../hooks/useAgentSessions';
import { useFleetSessionStates } from '../../hooks/useFleetSessionStates';
import { SessionsTable } from '../SessionsTable';

/** The card around the list, or nothing for the plain variant. */
function SessionsFrame({
  plain,
  children,
}: {
  plain: boolean;
  children: ReactNode;
}) {
  return plain ? (
    <>{children}</>
  ) : (
    <InfoCard title="Sessions">{children}</InfoCard>
  );
}

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
 *
 * Inside the agent-platform shell the list is a tab of its own named
 * "Sessions", so it drops the card and its heading (`plain`) and says whose
 * sessions these are in the prototype's words.
 */
export function AgentSessionsCard({
  sessions,
  onStartSession,
  plain = false,
  agentName,
}: {
  sessions: AgentSessionsView;
  /** Opens the new-session dialog. Absent while the agent is not ready. */
  onStartSession?: () => void;
  /** Without the card and its heading, for a tab that already names it. */
  plain?: boolean;
  /** The agent's name, for the plain variant's caption. */
  agentName?: string;
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
      <SessionsFrame plain={plain}>
        <Text variant="body-medium" color="secondary">
          Sessions could not be read from this environment.
        </Text>
      </SessionsFrame>
    );
  }

  if (!isLoading && rows.length === 0) {
    return (
      <SessionsFrame plain={plain}>
        <Flex direction="column" gap="3" align="start">
          <Text variant="body-medium" color="secondary">
            {/* "No sessions", not "none started": a runtime upgrade or kagent's
                retention can remove sessions people did have. */}
            {isNotUserScoped
              ? 'There are no sessions with this agent.'
              : 'You have no sessions with this agent.'}
          </Text>
          {onStartSession && (
            <Button variant="primary" onPress={onStartSession}>
              Start a session
            </Button>
          )}
        </Flex>
      </SessionsFrame>
    );
  }

  let caption: string;
  if (isNotUserScoped) {
    // Not a caveat we can hide: on an installation running kagent in
    // `unsecure` mode the list is everyone's, so calling it "yours" would be
    // a lie in the other direction.
    caption =
      "These are everyone's sessions with this agent, because kagent here does not scope sessions to users.";
  } else if (plain) {
    caption = `These are your sessions with ${agentName || 'this agent'}.`;
  } else {
    caption =
      'These are only your sessions with this agent, not a usage total.';
  }

  return (
    <SessionsFrame plain={plain}>
      <Flex direction="column" gap="3">
        <Text variant="body-small" color="secondary">
          {caption}
        </Text>

        <SessionsTable
          rows={rows}
          sessionStates={sessionStates}
          isLoading={isLoading}
          hideColumns={['agentName', 'installation']}
        />
      </Flex>
    </SessionsFrame>
  );
}
