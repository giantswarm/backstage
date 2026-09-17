import { Alert, Flex, Text } from '@backstage/ui';
import { ServerSignIn } from '@giantswarm/backstage-plugin-muster';

import { MARGE_SERVER } from '../../lib/marge';

/**
 * The person's muster session holds no GitHub grant for marge yet: says so in
 * muster's words and offers the muster plugin's own per-server sign-in. The
 * popup closes itself once GitHub answers, the muster plugin invalidates its
 * reads, and the queue loads on this page without a second step.
 */
export function ConnectMargeAlert({
  installation,
  message,
}: {
  installation: string;
  /** muster's answer, verbatim. */
  message: string;
}) {
  return (
    <Alert
      status="warning"
      title="Sign in to GitHub for marge"
      description={
        <Flex direction="column" gap="2">
          <Text variant="body-small">
            The queue is read, and every action runs, through marge as you:
            marge uses your own GitHub grant, so a merge or a comment carries
            your name. Your muster session on {installation} holds no grant for
            it yet: {message}
          </Text>
          <ServerSignIn serverName={MARGE_SERVER} installation={installation} />
        </Flex>
      }
    />
  );
}
