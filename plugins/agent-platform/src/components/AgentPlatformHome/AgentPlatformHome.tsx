import { useEffect, useState } from 'react';
import { EmptyState, Progress } from '@backstage/core-components';
import {
  identityApiRef,
  useApi,
  useRouteRef,
} from '@backstage/frontend-plugin-api';
import { Box, Container, Flex, Text } from '@backstage/ui';
import { InstallationInventoryGate } from '@giantswarm/backstage-plugin-gs';

import { sessionDetailRouteRef } from '../../routes';
import { AgentPlatformCookieAuth } from '../AgentPlatformCookieAuth';
import { AgentsDataProvider, useAgents } from '../AgentsDataProvider';
import { InstallationScopeNote } from '../InstallationScopeNote';
import { ModelConfigsProvider } from '../ModelConfigsProvider';
import { QueryClientProvider } from '../QueryClientProvider';
import { ServingProvider } from '../ServingProvider';
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

function AgentPlatformHomeContent() {
  const displayName = useDisplayName();
  const { isLoading, unreachableInstallations } = useAgents();

  return (
    <Container py="6">
      <Box maxWidth="720px" mx="auto">
        <Flex direction="column" gap="6">
          <Flex justify="center">
            <Text as="h1" variant="title-medium">
              {greeting(new Date(), displayName)}
            </Text>
          </Flex>
          {isLoading ? (
            <Progress aria-label="Loading agents" />
          ) : (
            <StartNewSession entryPoint="home" layout="standalone" />
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
 * starts a new session.
 *
 * Mounts the same providers as the Sessions tab, so the composer's agent
 * picker, avatars and model-serving warning behave as they do there and share
 * its query cache.
 */
export function AgentPlatformHome() {
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
              <AgentPlatformHomeContent />
            </AgentsDataProvider>
          </ServingProvider>
        </ModelConfigsProvider>
      </QueryClientProvider>
    </AgentPlatformCookieAuth>
  );
}
