import { useCallback, useEffect, useMemo, useState } from 'react';
import { EmptyState, Progress } from '@backstage/core-components';
import {
  identityApiRef,
  useApi,
  useRouteRef,
} from '@backstage/frontend-plugin-api';
import { Box, Container, Flex, Link, Text } from '@backstage/ui';
import { InstallationInventoryGate } from '@giantswarm/backstage-plugin-gs';

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
import { ModelChip } from '../ModelChip';
import { ModelConfigsProvider } from '../ModelConfigsProvider';
import type { NewSessionComposerFooterContext } from '../NewSessionComposer';
import { RecentAgentChips } from '../RecentAgentChips';
import { QueryClientProvider } from '../QueryClientProvider';
import { ServingProvider } from '../ServingProvider';
import { SessionsDataProvider, useSessions } from '../SessionsDataProvider';
import { StartNewSession } from '../StartNewSession';
import { UnreachableInstallationsAlert } from '../UnreachableInstallationsAlert';
import { greeting } from './helpers';

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
 * The field's placeholder: once an agent is chosen it names it, before that it
 * says the agent comes first.
 */
function promptPlaceholder(agent: AgentRow | undefined): string {
  return agent
    ? `What can ${agent.name} help you with?`
    : 'Choose an agent first, then type your message here.';
}

function pickerAccessory(agent: AgentRow | undefined) {
  return agent ? (
    <ModelChip model={agent.model} />
  ) : (
    <Text variant="body-small" color="secondary">
      Required to start
    </Text>
  );
}

export type AgentPlatformHomeProps = {
  /** Where "Manage agents" leads; the link is left out without one. */
  manageAgentsHref?: string;
};

function AgentPlatformHomeContent({
  manageAgentsHref,
}: AgentPlatformHomeProps) {
  const displayName = useDisplayName();
  const { rows: agents, isLoading, unreachableInstallations } = useAgents();
  const { rows: sessions } = useSessions();
  const [selectedAgent, setSelectedAgent] = useState<AgentRow>();
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
        {manageAgentsHref && (
          <Link href={manageAgentsHref} variant="body-small">
            Manage agents
          </Link>
        )}
      </Flex>
    ),
    [recent, manageAgentsHref],
  );

  return (
    <Container py="6">
      <Box maxWidth="720px" mx="auto">
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
                showUnavailable: true,
                groupByNamespace: true,
                recentAgentIds,
                searchable: true,
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
