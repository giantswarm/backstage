import { Alert, Flex, Text } from '@backstage/ui';
import { ServerSignIn } from '@giantswarm/backstage-plugin-muster';

import { AGENT_MANAGER_SERVER } from '../../lib/agentManager';

/**
 * The person's muster session is not connected to agent-manager yet: says so
 * in muster's words and offers the muster plugin's sign-in for the server. The
 * same affordance wherever a write or a dry run needs agent-manager — the
 * create review, the edit page, the delete and update-skills dialogs.
 *
 * With `needsGitHub`, agent-manager answered `auth_required` to a write in
 * mode `commit`: the pull request is opened with the person's GitHub
 * authorization, which reaches agent-manager through the same sign-in. Its
 * answer stays in sight, since it may name what GitHub refused (the App not
 * installed on the repository, no push access).
 */
export function ConnectAgentManagerAlert({
  installation,
  message,
  action = 'Agents are changed',
  server = AGENT_MANAGER_SERVER,
  needsGitHub = false,
}: {
  installation: string;
  /** muster's answer, verbatim. */
  message: string;
  /** What the person was about to do, as the sentence's subject. */
  action?: string;
  /** The muster server to connect to; agent-manager unless said otherwise. */
  server?: string;
  /** The write needs the person's GitHub authorization (`auth_required`). */
  needsGitHub?: boolean;
}) {
  return (
    <Alert
      status="warning"
      title={
        needsGitHub ? `Authorize GitHub for ${server}` : `Connect to ${server}`
      }
      description={
        <Flex direction="column" gap="2">
          {needsGitHub ? (
            <>
              <Text variant="body-small">
                {action} through pull requests that {server} opens as you, with
                your GitHub authorization. Sign in to {server} on {installation}{' '}
                to give it.
              </Text>
              <Text variant="body-small" color="secondary">
                {message}
              </Text>
            </>
          ) : (
            <Text variant="body-small">
              {action} through {server}, reached through muster as you. Your
              muster session on {installation} is not connected to it yet:{' '}
              {message}
            </Text>
          )}
          <ServerSignIn
            noun="connector"
            serverName={server}
            installation={installation}
          />
        </Flex>
      }
    />
  );
}
