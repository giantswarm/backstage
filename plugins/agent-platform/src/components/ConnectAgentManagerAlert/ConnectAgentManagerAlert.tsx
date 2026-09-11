import { Alert, Flex, Text } from '@backstage/ui';
import { ServerSignIn } from '@giantswarm/backstage-plugin-muster';

import { AGENT_MANAGER_SERVER } from '../../lib/agentManager';

/**
 * The person's muster session is not connected to agent-manager yet: says so
 * in muster's words and offers the muster plugin's sign-in for the server. The
 * same affordance wherever a write or a dry run needs agent-manager — the
 * create review, the edit page, the delete and update-skills dialogs.
 */
export function ConnectAgentManagerAlert({
  installation,
  message,
  action = 'Agents are changed',
}: {
  installation: string;
  /** muster's answer, verbatim. */
  message: string;
  /** What the person was about to do, as the sentence's subject. */
  action?: string;
}) {
  return (
    <Alert
      status="warning"
      title="Connect to agent-manager"
      description={
        <Flex direction="column" gap="2">
          <Text variant="body-small">
            {action} through agent-manager, reached through muster as you. Your
            muster session on {installation} is not connected to it yet:{' '}
            {message}
          </Text>
          <ServerSignIn
            serverName={AGENT_MANAGER_SERVER}
            installation={installation}
          />
        </Flex>
      }
    />
  );
}
