import { Alert, Flex, Text } from '@backstage/ui';
import {
  ServerSignIn,
  useConnectorLabel,
} from '@giantswarm/backstage-plugin-muster';

import { useMargeServerName } from '../../hooks/useMarge';

/**
 * The person's muster session holds no GitHub grant for marge yet: says so in
 * the portal's own words, naming the connector by its display name, and
 * offers the muster plugin's own per-server sign-in. muster's answer is not
 * shown: it names the server by its technical name and says nothing more.
 * The popup closes itself once GitHub answers, the muster plugin invalidates
 * its reads, and the queue loads on this page without a second step.
 */
export function ConnectMargeAlert({ installation }: { installation: string }) {
  const serverName = useMargeServerName(installation);
  const label = useConnectorLabel(installation, serverName);
  return (
    <Alert
      status="warning"
      title={`Sign in to GitHub for ${label}`}
      description={
        <Flex direction="column" gap="2">
          <Text variant="body-small">
            The queue is read, and every action runs, through the {label}{' '}
            connector as you: it uses your own GitHub grant, so a merge or a
            comment carries your name. You have not given it that grant on{' '}
            {installation} yet.
          </Text>
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
