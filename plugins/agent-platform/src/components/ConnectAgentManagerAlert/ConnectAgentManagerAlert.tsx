import { Alert, Flex, Text } from '@backstage/ui';
import {
  ServerSignIn,
  type SignedIn,
  useConnectorLabel,
} from '@giantswarm/backstage-plugin-muster';

import { AGENT_MANAGER_SERVER } from '../../lib/agentManager';

/**
 * The person's muster session cannot use the connector a write or a dry run
 * goes through (agent-manager unless said otherwise): names the connector by
 * its display name and offers the muster plugin's sign-in for it. The same
 * affordance wherever such a call needs the connector — the create review,
 * the edit page, the delete and update-skills dialogs, the session start.
 *
 * Where muster asked for the person's sign-in (`signInRequired`, read from
 * its 401 where the error is classified), the alert says so in the portal's
 * own words and leaves muster's out: they name the server by its technical
 * name and say nothing more. Any other not-connected answer (a tool not found, a server
 * not connected) may have a cause a sign-in does not fix, a server that is
 * down or not registered, so muster's answer stays in sight there.
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
  signInRequired: asksSignIn = false,
  onSignedIn,
}: {
  installation: string;
  /** The answer the call got, muster's or agent-manager's. */
  message: string;
  /** What the person was about to do, as the sentence's subject. */
  action?: string;
  /** The muster server to connect to; agent-manager unless said otherwise. */
  server?: string;
  /** The write needs the person's GitHub authorization (`auth_required`). */
  needsGitHub?: boolean;
  /**
   * muster asked for the person's sign-in to the connector (its 401, kept on
   * the failure as `signInRequired`), rather than answering "not connected"
   * some other way, which a sign-in may not fix.
   */
  signInRequired?: boolean;
  /**
   * Called once the person is signed in to the connector (see `SignedIn`
   * for where): the caller clears the refusal, and may run the call again.
   * Not for `needsGitHub`: agent-manager is connected already there, so a
   * click answers "connected" without the GitHub authorization being given.
   */
  onSignedIn?: (signedIn: SignedIn) => void;
}) {
  const label = useConnectorLabel(installation, server);
  const signInRequired = !needsGitHub && asksSignIn;
  let title = `Connect to ${label}`;
  if (needsGitHub) {
    title = `Authorize GitHub for ${label}`;
  } else if (signInRequired) {
    title = `Sign in to ${label}`;
  }
  return (
    <Alert
      status="warning"
      title={title}
      description={
        <Flex direction="column" gap="2">
          {needsGitHub && (
            <>
              <Text variant="body-small">
                {action} through pull requests that the {label} connector opens
                as you, with your GitHub authorization. Sign in to {label} on{' '}
                {installation} to give it.
              </Text>
              <Text variant="body-small" color="secondary">
                {message}
              </Text>
            </>
          )}
          {signInRequired && (
            <Text variant="body-small">
              {action} through the {label} connector, which acts as you. You
              have not signed in to it on {installation} yet.
            </Text>
          )}
          {!needsGitHub && !signInRequired && (
            <>
              <Text variant="body-small">
                {action} through the {label} connector, which acts as you. Your
                session on {installation} is not connected to it.
              </Text>
              <Text variant="body-small" color="secondary">
                {message}
              </Text>
            </>
          )}
          <ServerSignIn
            noun="connector"
            serverName={server}
            displayName={label}
            installation={installation}
            onSignedIn={needsGitHub ? undefined : onSignedIn}
          />
        </Flex>
      }
    />
  );
}
