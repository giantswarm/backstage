import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Flex, Link, Text } from '@backstage/ui';
import { EmptyStateCard } from '@giantswarm/backstage-plugin-ui-react';

import {
  useCreateSession,
  type SessionEntryPoint,
} from '../../hooks/useCreateSession';
import { useLastUsedAgent } from '../../hooks/useLastUsedAgent';
import { NEW_SESSION_STATE_KEY } from '../../hooks/useNewSessionHandoff';
import { agentsRouteRef, sessionDetailRouteRef } from '../../routes';
import { AgentRow, useAgents } from '../AgentsDataProvider';
import { FirstAgentCard } from '../FirstAgentCard';
import {
  isStartableAgent,
  NewSessionComposer,
  type NewSessionComposerProps,
} from '../NewSessionComposer';

/**
 * Where the composer sits:
 *
 * - `inline`: a collapsed strip under a "Start a new session" heading, above a
 *   list of sessions.
 * - `firstRun`: expanded, inside the invitation card the Agents tab uses, when
 *   there is no session yet and no list below it.
 * - `standalone`: expanded and bare, under a heading the caller renders.
 */
export type StartNewSessionLayout = 'inline' | 'firstRun' | 'standalone';

/** The composer's opt-in props a caller may pass through. */
export type StartNewSessionComposerProps = Pick<
  NewSessionComposerProps,
  | 'showUnavailable'
  | 'groupByNamespace'
  | 'recentAgentIds'
  | 'searchable'
  | 'pickerPlaceholder'
  | 'pickerFooterAction'
  | 'initialPrompt'
  | 'promptPlaceholder'
  | 'renderPickerAccessory'
  | 'renderFooter'
  | 'onSelectedAgentChange'
>;

export type StartNewSessionProps = {
  /** Where the person starts the session from, as the analytics event says. */
  entryPoint: SessionEntryPoint;
  layout?: StartNewSessionLayout;
  composerProps?: StartNewSessionComposerProps;
  /** Passed to `useCreateSession` as the derived title's bound. */
  titleMaxLength?: number;
};

/**
 * Start a new session: pick an agent, write the prompt, and land on the
 * conversation.
 *
 * Withheld with a reason when the fleet offers no agent at all. An inert prompt
 * box that refuses every Start would be worse than saying why. Renders nothing
 * while the agents are loading.
 *
 * Reads `useAgents`, so it renders under `AgentsDataProvider`.
 */
export function StartNewSession({
  entryPoint,
  layout = 'inline',
  composerProps,
  titleMaxLength,
}: StartNewSessionProps) {
  const navigate = useNavigate();
  const sessionDetailRoute = useRouteRef(sessionDetailRouteRef);
  const agentsRoute = useRouteRef(agentsRouteRef);
  const {
    rows: agents,
    installations: agentInstallations,
    isLoading: isLoadingAgents,
    isLoadingMore: isLoadingMoreAgents,
    unreachableInstallations,
  } = useAgents();
  const { lastUsedAgent, rememberAgent } = useLastUsedAgent(agents);
  const creation = useCreateSession(entryPoint, { titleMaxLength });

  const { createSession } = creation;
  const onStart = useCallback(
    async (agent: AgentRow, prompt: string) => {
      let sessionId: string;
      try {
        sessionId = await createSession({ agent, prompt });
      } catch {
        // Left to the composer, which renders the hook's `error` beside the
        // prompt the user still has.
        return;
      }

      rememberAgent(agent);

      const href = sessionDetailRoute?.({
        installation: agent.installation,
        sessionId,
      });
      if (!href) {
        // Only reachable with the route unbound, which means the Agent Platform
        // extension is disabled. The session exists regardless, so there is
        // nothing to undo.
        return;
      }

      // The prompt is **not** sent here. It travels with the navigation and is
      // dispatched by the session detail page, so the user lands on the
      // conversation immediately instead of waiting out a turn on this screen.
      // See "Starting a session" in docs/agent-platform.md.
      navigate(href, {
        state: {
          [NEW_SESSION_STATE_KEY]: {
            text: prompt,
            agentNamespace: agent.namespace,
            // The technical name: it is what addresses the agent's A2A
            // endpoint. The display name is an annotation.
            agentName: agent.technicalName,
          },
        },
      });
    },
    [createSession, navigate, rememberAgent, sessionDetailRoute],
  );

  if (isLoadingAgents) {
    return null;
  }

  // The same predicate the picker filters on, so the composer is never offered with
  // an empty dropdown and never withheld while a usable agent exists.
  const startable = agents.filter(isStartableAgent);

  if (startable.length === 0) {
    // Nothing is deployed, the fleet answered, and there is somewhere to deploy
    // to: this is the first-run state, and it is the Agents tab's invitation
    // rather than a sentence about sessions -- creating an agent is the step
    // before any session exists.
    if (
      agents.length === 0 &&
      unreachableInstallations.length === 0 &&
      agentInstallations.length > 0
    ) {
      return <FirstAgentCard />;
    }

    // Three distinct situations, and conflating them would tell the user to look
    // in the wrong place: nothing could be read (look at the warning), nothing
    // is deployed and there is nowhere to deploy to either (an installation
    // scope that runs no kagent), or something is deployed but none of it is
    // ready (look at the Agents tab, where the reason is). Standalone, the
    // Agents tab is a link rather than a neighbouring tab.
    let reason: string;
    let pointer: 'warning' | 'agentsTab' | undefined;
    if (unreachableInstallations.length > 0 && agents.length === 0) {
      reason =
        'No agents could be read, so there is none to start a session with.';
      pointer = 'warning';
    } else if (agents.length === 0) {
      reason =
        'No agents are deployed on the reachable installations, so there is none to start a session with.';
    } else {
      reason =
        agents.length === 1
          ? 'The only agent on the fleet is not ready, so there is none to start a session with.'
          : `None of the ${agents.length} agents on the fleet are ready, so there is none to start a session with.`;
      pointer = 'agentsTab';
    }

    // Standalone, the line stands where the composer would, under a greeting,
    // and reads at body size; next to a list it stays a caption.
    const lineVariant = layout === 'standalone' ? 'body-medium' : 'body-small';

    if (pointer === 'warning') {
      return (
        <Text variant={lineVariant} color="secondary">
          {`${reason} See the warning below.`}
        </Text>
      );
    }

    if (layout !== 'standalone' || !pointer) {
      return (
        <Text variant={lineVariant} color="secondary">
          {pointer ? `${reason} The Agents tab says why.` : reason}
        </Text>
      );
    }

    const agentsHref = agentsRoute?.();
    return (
      <Text variant={lineVariant} color="secondary">
        {reason}
        {agentsHref && (
          <>
            {' '}
            <Link href={agentsHref} variant={lineVariant}>
              See why on the Agents tab.
            </Link>
          </>
        )}
      </Text>
    );
  }

  const composer = (
    <NewSessionComposer
      {...composerProps}
      agents={agents}
      isLoadingAgents={isLoadingMoreAgents}
      defaultAgent={lastUsedAgent}
      // Collapsed only when it sits above a list of sessions. Elsewhere it opens
      // showing the agent picker and the Start button: there is nothing for it
      // to make room for.
      collapsible={layout === 'inline'}
      isStarting={creation.isCreating}
      error={creation.error?.message}
      onStart={onStart}
    />
  );

  if (layout === 'standalone') {
    return composer;
  }

  if (layout === 'firstRun') {
    return (
      <EmptyStateCard
        title="Start your first session"
        description="Pick an agent, say what you need, and the conversation opens as soon as it starts."
      >
        {composer}
      </EmptyStateCard>
    );
  }

  return (
    <Flex direction="column" gap="2">
      <Text as="h2" variant="title-x-small">
        Start a new session
      </Text>
      {composer}
    </Flex>
  );
}
