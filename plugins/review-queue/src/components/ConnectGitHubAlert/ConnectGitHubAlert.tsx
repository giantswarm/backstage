import { Alert, Flex, Text } from '@backstage/ui';
import {
  musterSignInRequiredOf,
  ServerSignIn,
  useConnectorLabel,
} from '@giantswarm/backstage-plugin-muster';

/**
 * The person's muster session cannot reach GitHub yet: names the connector
 * by its display name and offers the muster plugin's own per-server sign-in.
 * Where muster asked for the sign-in, the alert says so in the portal's
 * words; any other answer stays in sight, since a sign-in may not fix it.
 * Once GitHub answers, `onSignedIn` reads the lists again.
 */
export function ConnectGitHubAlert({
  installation,
  serverName,
  error,
  onSignedIn,
}: {
  installation: string;
  serverName: string;
  error: Error;
  onSignedIn: () => void;
}) {
  const label = useConnectorLabel(installation, serverName);
  const signInRequired = Boolean(musterSignInRequiredOf(error.cause));
  return (
    <Alert
      status="warning"
      title={`Sign in to GitHub for ${label}`}
      description={
        <Flex direction="column" gap="2">
          <Text variant="body-small">
            The Reviews tab reads GitHub through the {label} connector as you,
            with your own GitHub grant.{' '}
            {signInRequired
              ? `You have not given it that grant on ${installation} yet.`
              : `Your session on ${installation} cannot use it yet.`}
          </Text>
          {!signInRequired && (
            <Text variant="body-small" color="secondary">
              {error.message}
            </Text>
          )}
          <ServerSignIn
            noun="connector"
            serverName={serverName}
            displayName={label}
            installation={installation}
            onSignedIn={onSignedIn}
          />
        </Flex>
      }
    />
  );
}
