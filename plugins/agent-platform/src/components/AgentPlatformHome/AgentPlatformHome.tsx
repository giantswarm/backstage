import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { EmptyState, Progress } from '@backstage/core-components';
import {
  identityApiRef,
  useApi,
  useRouteRef,
} from '@backstage/frontend-plugin-api';
import { Box, Container, Flex, Text } from '@backstage/ui';
import { InstallationInventoryGate } from '@giantswarm/backstage-plugin-gs';

import { makeStyles } from '@material-ui/core/styles';

import { recentAgents } from '../../lib/recentAgents';
import { sessionDetailRouteRef } from '../../routes';
import { AgentReachLine } from '../AgentReachLine';
import { SESSION_NAME_MAX_LENGTH } from '../SessionDetailPage/SessionRenameDialog';
import { AgentPlatformCookieAuth } from '../AgentPlatformCookieAuth';
import {
  AgentsDataProvider,
  useAgents,
  type AgentRow,
} from '../AgentsDataProvider';
import { InstallationScopeNote } from '../InstallationScopeNote';
import { ModelConfigsProvider } from '../ModelConfigsProvider';
import type {
  NewSessionComposerFooterContext,
  NewSessionComposerPickerAction,
} from '../NewSessionComposer';
import { RecentAgentChips } from '../RecentAgentChips';
import { QueryClientProvider } from '../QueryClientProvider';
import { ServingProvider } from '../ServingProvider';
import { SessionsDataProvider, useSessions } from '../SessionsDataProvider';
import { StartNewSession } from '../StartNewSession';
import { UnreachableInstallationsAlert } from '../UnreachableInstallationsAlert';
import { greeting } from './helpers';

const useStyles = makeStyles({
  /**
   * Centers the whole new-session block in the content area, vertically and
   * horizontally, as the prototype's Main artboard does. The height is the
   * viewport less the mobile bottom bar (`--agent-shell-mobile-bar-height` is
   * 0px on desktop and 56px + the home-indicator inset at phone width —
   * agent-shell.css owns it), so the centered block never hides behind the
   * bar. `min-height`, not `height`: content taller than the viewport pushes
   * the page into normal scrolling instead of clipping at the top.
   */
  centered: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    minHeight: 'calc(100dvh - var(--agent-shell-mobile-bar-height, 0px))',
    // JSS puts the fallback first, so browsers without dvh keep vh.
    fallbacks: {
      minHeight: 'calc(100vh - var(--agent-shell-mobile-bar-height, 0px))',
    },
  },
});

function useDisplayName(): string | undefined {
  const identityApi = useApi(identityApiRef);
  const [displayName, setDisplayName] = useState<string>();
  useEffect(() => {
    let cancelled = false;
    identityApi
      .getProfileInfo()
      .then(info => {
        if (!cancelled) {
          setDisplayName(info.displayName);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [identityApi]);
  return displayName;
}

/**
 * The field's placeholder: once an agent is chosen it names it; before that
 * the artboard's "Then …" says the field is step two of the sequence the
 * picker starts.
 */
function promptPlaceholder(agent: AgentRow | undefined): string {
  return agent
    ? `What can ${agent.name} help you with?`
    : 'Then type your message here.';
}

/**
 * Beside the picker: only the reminder that the agent is required. The model
 * chip that used to stand here is deliberately gone from this surface — the
 * model is the agent detail page's information, not a decision made while
 * starting a session.
 */
function pickerAccessory(agent: AgentRow | undefined) {
  return agent ? null : (
    <Text variant="body-small" color="secondary">
      Required to start
    </Text>
  );
}

export type AgentPlatformHomeProps = {
  /**
   * Where "Manage agents", the agent picker's last entry, leads; the entry is
   * left out without one.
   */
  manageAgentsHref?: string;
};

function AgentPlatformHomeContent({
  manageAgentsHref,
}: AgentPlatformHomeProps) {
  const classes = useStyles();
  const displayName = useDisplayName();
  const { rows: agents, isLoading, unreachableInstallations } = useAgents();
  const { rows: sessions } = useSessions();
  const [selectedAgent, setSelectedAgent] = useState<AgentRow>();
  const navigate = useNavigate();
  const recent = useMemo(
    () => recentAgents(sessions, agents),
    [sessions, agents],
  );
  const recentAgentIds = useMemo(() => recent.map(agent => agent.id), [recent]);

  // The chips stand in for a choice not yet made; once an agent is chosen the
  // line says what it can reach.
  const renderFooter = useCallback(
    ({
      selectedAgent: agent,
      selectAgent,
    }: NewSessionComposerFooterContext) => (
      <Flex direction="column" align="center" gap="3" mt="2">
        {agent ? (
          <AgentReachLine toolset={agent.toolset} />
        ) : (
          <RecentAgentChips agents={recent} onPick={selectAgent} />
        )}
      </Flex>
    ),
    [recent],
  );
  const manageAgents = useMemo<NewSessionComposerPickerAction | undefined>(
    () =>
      manageAgentsHref
        ? { label: 'Manage agents', onAction: () => navigate(manageAgentsHref) }
        : undefined,
    [manageAgentsHref, navigate],
  );

  return (
    <Container py="6" className={classes.centered}>
      <Box maxWidth="720px" mx="auto" width="100%">
        <Flex direction="column" gap="6">
          <Flex direction="column" align="center" gap="2">
            <Text as="h1" variant="title-medium">
              {greeting(new Date(), displayName)}
            </Text>
            <Text as="p" variant="body-medium" color="secondary">
              {selectedAgent
                ? `You're starting a session with ${selectedAgent.name}.`
                : 'Choose an agent to work with, then tell it what you need.'}
            </Text>
          </Flex>
          {isLoading ? (
            <Progress aria-label="Loading agents" />
          ) : (
            <StartNewSession
              entryPoint="home"
              layout="standalone"
              // The rename dialog's bound, less the ellipsis a clipped title
              // ends in.
              titleMaxLength={SESSION_NAME_MAX_LENGTH - 1}
              composerProps={{
                // The agent is unmistakably the first step: the picker carries
                // the accent ring and the prompt field waits, per the artboard.
                agentFirst: true,
                showUnavailable: true,
                groupByNamespace: true,
                recentAgentIds,
                searchable: true,
                pickerPlaceholder: 'Choose an agent',
                pickerFooterAction: manageAgents,
                promptPlaceholder,
                renderPickerAccessory: pickerAccessory,
                renderFooter,
                onSelectedAgentChange: setSelectedAgent,
              }}
            />
          )}
          <InstallationScopeNote component="kagent" />
          <InstallationInventoryGate context="Which installations run kagent is read through their Kubernetes API." />
          <UnreachableInstallationsAlert
            installations={unreachableInstallations}
            resourceName="Agents"
          />
        </Flex>
      </Box>
    </Container>
  );
}

/**
 * The home page of the Agent Platform shell: a greeting, and the composer that
 * starts a new session, with the person's recent agents one press away.
 *
 * Mounts the same providers as the Sessions tab, so the composer's agent
 * picker, avatars and model-serving warning behave as they do there and share
 * its query cache.
 */
export function AgentPlatformHome({
  manageAgentsHref,
}: AgentPlatformHomeProps) {
  const sessionDetailRoute = useRouteRef(sessionDetailRouteRef);

  if (!sessionDetailRoute) {
    return (
      <EmptyState
        missing="info"
        title="Agent Platform is not enabled"
        description="Sessions are started from the Agent Platform, which is not enabled on this portal."
      />
    );
  }

  return (
    <AgentPlatformCookieAuth>
      <QueryClientProvider>
        <ModelConfigsProvider>
          <ServingProvider>
            <AgentsDataProvider>
              <SessionsDataProvider>
                <AgentPlatformHomeContent manageAgentsHref={manageAgentsHref} />
              </SessionsDataProvider>
            </AgentsDataProvider>
          </ServingProvider>
        </ModelConfigsProvider>
      </QueryClientProvider>
    </AgentPlatformCookieAuth>
  );
}
