import { Alert, Flex, Text } from '@backstage/ui';
import {
  ServerSignIn,
  useConnectorLabel,
} from '@giantswarm/backstage-plugin-muster';

import { AGENT_MANAGER_SERVER } from '../../lib/agentManager';

/**
 * The person has not signed in to the connector a write or a dry run goes
 * through (agent-manager unless said otherwise): says so in the portal's own
 * words, naming the connector by its display name, and offers the muster
 * plugin's sign-in for it. The same affordance wherever such a call needs the
 * sign-in — the create review, the edit page, the delete and update-skills
 * dialogs, the session start. muster's own answer (`auth_required: server
 * '…' requires authentication`, a tool not found) is not shown: it names the
 * server by its technical name and says nothing the alert does not.
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
  /**
   * The answer the call got. Shown with `needsGitHub` only, where it is
   * agent-manager's and may name what GitHub refused.
   */
  message?: string;
  /** What the person was about to do, as the sentence's subject. */
  action?: string;
  /** The muster server to connect to; agent-manager unless said otherwise. */
  server?: string;
  /** The write needs the person's GitHub authorization (`auth_required`). */
  needsGitHub?: boolean;
}) {
  const label = useConnectorLabel(installation, server);
  return (
    <Alert
      status="warning"
      title={
        needsGitHub ? `Authorize GitHub for ${label}` : `Sign in to ${label}`
      }
      description={
        <Flex direction="column" gap="2">
          {needsGitHub ? (
            <>
              <Text variant="body-small">
                {action} through pull requests that the {label} connector opens
                as you, with your GitHub authorization. Sign in to {label} on{' '}
                {installation} to give it.
              </Text>
              {message && (
                <Text variant="body-small" color="secondary">
                  {message}
                </Text>
              )}
            </>
          ) : (
            <Text variant="body-small">
              {action} through the {label} connector, which acts as you. You
              have not signed in to it on {installation} yet.
            </Text>
          )}
          <ServerSignIn
            noun="connector"
            serverName={server}
            displayName={label}
            installation={installation}
          />
        </Flex>
      }
    />
  );
}
