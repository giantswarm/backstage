import { Alert, Flex, Text } from '@backstage/ui';
import {
  isMusterSignInRequiredText,
  ServerSignIn,
  useConnectorLabel,
} from '@giantswarm/backstage-plugin-muster';

import { useMargeServerName } from '../../hooks/useMarge';

/**
 * The person's muster session cannot reach marge yet: names the connector by
 * its display name and offers the muster plugin's own per-server sign-in.
 * Where muster asked for the person's sign-in, the alert says so in the
 * portal's own words and leaves muster's out; any other not-connected answer
 * (a tool not found, marge refusing the grant) stays in sight, since a
 * sign-in may not be what fixes it. The popup closes itself once GitHub
 * answers, the muster plugin invalidates its reads, and the queue loads on
 * this page without a second step.
 */
export function ConnectMargeAlert({
  installation,
  message,
}: {
  installation: string;
  /** The answer the call got, muster's or marge's. */
  message: string;
}) {
  const serverName = useMargeServerName(installation);
  const label = useConnectorLabel(installation, serverName);
  const signInRequired = isMusterSignInRequiredText(message);
  return (
    <Alert
      status="warning"
      title={`Sign in to GitHub for ${label}`}
      description={
        <Flex direction="column" gap="2">
          <Text variant="body-small">
            The queue is read, and every action runs, through the {label}{' '}
            connector as you: it uses your own GitHub grant, so a merge or a
            comment carries your name.{' '}
            {signInRequired
              ? `You have not given it that grant on ${installation} yet.`
              : `Your session on ${installation} cannot use it yet.`}
          </Text>
          {!signInRequired && (
            <Text variant="body-small" color="secondary">
              {message}
            </Text>
          )}
          <ServerSignIn
            noun="connector"
            serverName={serverName}
            displayName={label}
            installation={installation}
          />
        </Flex>
      }
    />
  );
}
