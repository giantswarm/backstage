import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Button, Flex, Link, Text } from '@backstage/ui';
import RefreshIcon from '@material-ui/icons/Refresh';
import {
  EmptyStateCard,
  LoadingIndicator,
} from '@giantswarm/backstage-plugin-ui-react';

import {
  useCreateSession,
  type SessionEntryPoint,
} from '../../hooks/useCreateSession';
import { useLastUsedAgent } from '../../hooks/useLastUsedAgent';
import {
  modelConfigNameOf,
  NEW_SESSION_STATE_KEY,
  stashHandoffImages,
} from '../../hooks/useNewSessionHandoff';
import type { ComposerImage } from '../../lib/messageImages';
import { agentsRouteRef, sessionDetailRouteRef } from '../../routes';
import {
  AgentRow,
  describeKagentSwitchedOff,
  useAgents,
} from '../AgentsDataProvider';
import { FirstAgentCard } from '../FirstAgentCard';
import { KagentMissingCard } from '../KagentMissingCard';
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
  | 'favoriteAgentIds'
  | 'searchable'
  | 'pickerPlaceholder'
  | 'pickerPlacement'
  | 'pickerLabel'
  | 'pickerFooterAction'
  | 'initialPrompt'
  | 'promptPlaceholder'
  | 'renderPickerAccessory'
  | 'renderFooter'
  | 'onSelectedAgentChange'
  | 'agentFirst'
  // A caller's own preselection (the home screen's `?agent=` link) wins over
  // the remembered last-used agent.
  | 'defaultAgent'
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
 * box that refuses every Start would be worse than saying why. The reasons are
 * Customize › Agents' own, from the same `useAgents` values. Standalone, it
 * shows the loading indicator while the agents are read, and the
 * kagent-missing card (even while other environments still load); the other
 * layouts render nothing while loading and say a missing kagent in a line.
 * Where the inventory gate or the installation scope note is the whole answer
 * (an environment that could not be asked, an unknown pin), it renders
 * nothing: the caller renders those, as Home does.
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
    hasInstallations,
    kagentMissing,
    kagentSwitchedOff,
    unknownPin,
    inventoryFailure,
    retry,
  } = useAgents();
  const { lastUsedAgent, rememberAgent } = useLastUsedAgent(agents);
  const creation = useCreateSession(entryPoint, { titleMaxLength });

  const { createSession } = creation;
  const onStart = useCallback(
    async (
      agent: AgentRow,
      prompt: string,
      images?: ComposerImage[],
      workspace?: string,
    ) => {
      let sessionId: string;
      try {
        sessionId = await createSession({ agent, prompt, workspace });
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
            modelConfig: modelConfigNameOf(agent),
            imagesKey: stashHandoffImages(images),
          },
        },
      });
    },
    [createSession, navigate, rememberAgent, sessionDetailRoute],
  );

  // Every environment in scope answered without kagent: no agent can be
  // started there, whatever else is still loading. Customize › Agents says it
  // with the same card; above a list of sessions (`inline`) a full card would
  // crowd the list out, so there the line below says it.
  if (layout === 'standalone' && kagentMissing) {
    return <KagentMissingCard {...kagentMissing} />;
  }

  if (isLoadingAgents) {
    return layout === 'standalone' ? (
      <LoadingIndicator label="Reading your agents…" />
    ) : null;
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
      return <FirstAgentCard installations={agentInstallations} />;
    }

    // An environment that could not be asked whether it runs kagent, or a pin
    // the portal does not know: the inventory gate or the scope note the
    // caller renders is the whole answer, as on Customize › Agents.
    if (
      agents.length === 0 &&
      unreachableInstallations.length === 0 &&
      agentInstallations.length === 0 &&
      (unknownPin || inventoryFailure)
    ) {
      return null;
    }

    // A ready agent whose installation is still being asked whether
    // agent-manager can start a session as the person: nothing to say yet.
    if (
      agents.some(
        agent => agent.readiness === 'ready' && agent.isSessionPending,
      )
    ) {
      return null;
    }

    // Distinct situations, and conflating them would tell the user to look in
    // the wrong place: nothing could be read (look at the warning), no
    // environment is configured, the environments that run kagent are
    // switched off in Cluster access (switch one back on), no environment in
    // reach runs kagent, or something is deployed but none of it is ready
    // (look at the Agents tab, where the reason is). Each sentence but the
    // first and the last is the one Customize › Agents says. Standalone, the
    // Agents tab is a link rather than a neighbouring tab.
    // One more: agents are ready, but their installations' agent-manager
    // cannot start a session as the person; the reasons say why, and the
    // Agents tab would not.
    const blockers = [
      ...new Set(
        agents.flatMap(agent =>
          agent.readiness === 'ready' && agent.sessionBlocker
            ? [agent.sessionBlocker]
            : [],
        ),
      ),
    ];
    // Standalone, the composer's place is the page's answer: a read that
    // failed there is an error state with its way forward, never a line that
    // could pass for an empty roster.
    if (
      layout === 'standalone' &&
      unreachableInstallations.length > 0 &&
      agents.length === 0
    ) {
      return <AgentsReadFailedCard onRetry={retry} />;
    }

    let reason: string;
    let pointer: 'warning' | 'agentsTab' | undefined;
    if (unreachableInstallations.length > 0 && agents.length === 0) {
      reason = 'No agents could be read to start a session with.';
      pointer = 'warning';
    } else if (agents.length === 0 && !hasInstallations) {
      reason =
        'Agents are read from your environments, and this portal knows none.';
    } else if (agents.length === 0 && kagentSwitchedOff.length > 0) {
      reason = describeKagentSwitchedOff(kagentSwitchedOff);
    } else if (agents.length === 0) {
      reason = 'No environment this portal can reach runs kagent.';
    } else if (blockers.length > 0) {
      reason = `Sessions cannot start from this portal. ${blockers.join(' ')}`;
    } else {
      reason =
        agents.length === 1
          ? 'The only agent is not ready for a session.'
          : `None of the ${agents.length} agents is ready for a session.`;
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
      defaultAgent={composerProps?.defaultAgent ?? lastUsedAgent}
      // Collapsed only when it sits above a list of sessions. Elsewhere it opens
      // showing the agent picker and the Start button: there is nothing for it
      // to make room for.
      collapsible={layout === 'inline'}
      isStarting={creation.isCreating}
      error={creation.error ?? undefined}
      // The session page sends the prompt, images and all.
      acceptsImages
      offersWorkspaces
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
        description="Pick an agent and say what you need."
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

/**
 * The agents could not be read, so whether the person has any is not known:
 * says so, points at the warning that names the environments and the reason,
 * and reads them again. Retry stays pressed until the reads have answered;
 * their answer then replaces the card (the composer, the first-agent card, or
 * this card again).
 */
function AgentsReadFailedCard({ onRetry }: { onRetry: () => Promise<void> }) {
  const [isRetrying, setIsRetrying] = useState(false);
  const onPress = async () => {
    setIsRetrying(true);
    try {
      await onRetry();
    } finally {
      setIsRetrying(false);
    }
  };

  // Not announced itself: the warning below, an alert, says it.
  return (
    <EmptyStateCard
      title="Couldn't load your agents"
      description="Your agents could not be read, so none can be offered to start a session with. The warning below says where and why."
      actions={
        <Button
          variant="primary"
          iconStart={<RefreshIcon />}
          loading={isRetrying}
          onPress={onPress}
        >
          Retry
        </Button>
      }
    />
  );
}
