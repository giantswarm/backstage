import { useMemo } from 'react';
import { useApi } from '@backstage/frontend-plugin-api';
import { Alert, Flex, Text } from '@backstage/ui';
import { useQuery } from '@tanstack/react-query';
import { musterApiRef } from '../../../apis';
import { MusterWorkflow } from '../../../lib/k8s';
import { serverPrefixInfos } from '../../../lib/toolGrouping';
import { serversOfTools, toolsOfWorkflow } from '../../../lib/workflowTools';
import { useMusterInstance } from '../../MusterInstanceProvider';
import { authStatusQueryKey, needsSignIn, ServerSignIn } from '../../shared';

/**
 * Names the servers a workflow's steps call that are waiting for the user's
 * sign-in, each with its Sign in: a run reaching one of their tools fails at
 * that step. Muster's per-user `auth://status`, read once per installation and
 * shared with every sign-in affordance, so a completed sign-in drops the server
 * from the list. Nothing when every server the workflow needs is signed in to.
 */
export function WorkflowAuthNotice({
  workflow,
  installation,
}: {
  workflow: MusterWorkflow;
  installation?: string;
}) {
  const musterApi = useApi(musterApiRef);
  const { workflows, mcpServers, activeInstallationInfo } = useMusterInstance();

  const servers = useMemo(
    () =>
      serversOfTools(
        toolsOfWorkflow(workflow, workflows),
        serverPrefixInfos(mcpServers),
      ),
    [workflow, workflows, mcpServers],
  );

  const { data } = useQuery({
    queryKey: authStatusQueryKey(installation),
    queryFn: () => musterApi.getAuthStatus(installation),
    enabled: Boolean(installation) && servers.length > 0,
    // As the sign-in affordances read it: re-read on return from the IdP's
    // tab, and an unreadable status is an answer, not a retry.
    refetchOnWindowFocus: true,
    retry: false,
  });

  const waiting = (data?.servers ?? [])
    .filter(status => servers.includes(status.name) && needsSignIn(status))
    .map(status => status.name);
  if (!installation || waiting.length === 0) {
    return null;
  }

  // Signing a user in to a server needs a per-user muster session, which only
  // an installation with an auth provider has.
  const canSignIn = activeInstallationInfo?.requiresAuth ?? false;

  return (
    <Alert
      status="warning"
      title="Authentication required"
      description={
        <Flex direction="column" gap="2">
          <Text variant="body-small">
            {waiting.length === 1
              ? 'This workflow calls tools of a server you are not signed in to. A run fails at the steps that reach it until you sign in.'
              : `This workflow calls tools of ${waiting.length} servers you are not signed in to. A run fails at the steps that reach them until you sign in.`}
          </Text>
          {canSignIn ? (
            waiting.map(server => (
              <ServerSignIn
                key={server}
                serverName={server}
                installation={installation}
                showName
              />
            ))
          ) : (
            <Text variant="body-small" color="secondary">
              This portal talks to muster without per-user credentials, so these
              servers ({waiting.join(', ')}) cannot be signed in to from here.
              An administrator has to configure an auth provider for this
              installation.
            </Text>
          )}
        </Flex>
      }
    />
  );
}
