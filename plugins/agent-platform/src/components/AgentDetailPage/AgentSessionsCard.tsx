import { useMemo } from 'react';
import { Button, Flex, Text } from '@backstage/ui';

import { AgentSessionsView } from '../../hooks/useAgentSessions';
import { useFleetSessionStates } from '../../hooks/useFleetSessionStates';
import { SessionsTable } from '../SessionsTable';
import { markEarlierRevisions } from '../SessionsDataProvider/helpers';

/**
 * The signed-in user's sessions with this agent.
 *
 * Explicitly *not* a usage metric. kagent scopes its session list to the caller,
 * so this shows only your own conversations — the prototype's "2,104 sessions
 * all-time" has no equivalent here, and inventing one from this list would be
 * wrong by orders of magnitude on a shared agent.
 *
 * The whole list, searchable once it is long: this is a tab of its own, and the five
 * rows it showed while it was one section of a scrolling page were a teaser for
 * a page that does not exist — the section's Sessions tab lists every agent's,
 * not this agent's, so it is not the "rest" of this list and is not linked here.
 *
 * With no sessions there is nothing to search, sort or page, so the table gives
 * way to the one thing to do next: start one, when the agent is ready.
 *
 * The list is a tab of its own named "Sessions", so it has no card or heading
 * and says whose sessions these are in the prototype's words.
 */
export function AgentSessionsCard({
  sessions,
  onStartSession,
  agentName,
  currentRevision,
}: {
  sessions: AgentSessionsView;
  /** Opens the new-session dialog. Absent while the agent is not ready. */
  onStartSession?: () => void;
  /** The agent's name, for the caption. */
  agentName?: string;
  /**
   * The Agent's latest successful revision: a session prepared on another one
   * is marked as running an earlier revision.
   */
  currentRevision?: string;
}) {
  const { rows, installation, isLoading, isNotUserScoped, isUnavailable } =
    sessions;
  // The same summary the Sessions tab reads, under the same query key: opening
  // this card after that tab costs nothing, and this page's read warms it back.
  const sessionStates = useFleetSessionStates(
    rows.length ? [installation] : [],
  );
  const markedRows = useMemo(
    () => markEarlierRevisions(rows, currentRevision),
    [rows, currentRevision],
  );

  if (isUnavailable) {
    return (
      <Text variant="body-medium" color="secondary">
        Sessions could not be read from this environment.
      </Text>
    );
  }

  if (!isLoading && rows.length === 0) {
    return (
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
    );
  }

  let caption: string;
  if (isNotUserScoped) {
    // Not a caveat we can hide: on an installation running kagent in
    // `unsecure` mode the list is everyone's, so calling it "yours" would be
    // a lie in the other direction.
    caption =
      "These are everyone's sessions with this agent, because kagent here does not scope sessions to users.";
  } else {
    caption = `These are your sessions with ${agentName || 'this agent'}.`;
  }

  return (
    <Flex direction="column" gap="3">
      <Text variant="body-small" color="secondary">
        {caption}
      </Text>

      {/* The Sessions page's own list (T46b): its state
            words, day groups and windowed Load more instead of pagination
            chrome, with search and filters only once there is something to
            narrow down. */}
      <SessionsTable
        rows={markedRows}
        sessionStates={sessionStates}
        isLoading={isLoading}
        hideColumns={['agentName', 'installation']}
      />
    </Flex>
  );
}
