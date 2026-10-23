import { useEffect, useRef, type ReactNode } from 'react';
import { Alert, Flex, Text } from '@backstage/ui';
import {
  ServerSignIn,
  useServerSignIn,
} from '@giantswarm/backstage-plugin-muster';

import { useMusterPluginApi } from '../../hooks/useMusterPluginApi';

export type ServerSignInCardProps = {
  /** The MCPServer muster has not signed the person in to yet. */
  serverName: string;
  installation: string;
  title: string;
  /** Why the sign-in is needed, and what opens once it lands. */
  description: ReactNode;
  'data-testid'?: string;
  /** Called once the person's muster session signed in to the server. */
  onSignedIn: () => void;
};

/**
 * In place of a read muster refused because the person's session has not
 * signed in to one of its servers yet (a platform manager such as
 * workspace-manager or the toolchain-manager): one card with muster's
 * sign-in; the read runs again once it lands.
 */
export function ServerSignInCard(props: ServerSignInCardProps) {
  return useMusterPluginApi() ? <SignInCard {...props} /> : null;
}

function SignInCard({
  serverName,
  installation,
  title,
  description,
  'data-testid': testId,
  onSignedIn,
}: ServerSignInCardProps) {
  const { needsLogin } = useServerSignIn(serverName, installation, {
    noun: 'connector',
  });
  const wasNeeded = useRef(needsLogin);
  useEffect(() => {
    if (wasNeeded.current && !needsLogin) {
      onSignedIn();
    }
    wasNeeded.current = needsLogin;
  }, [needsLogin, onSignedIn]);

  return (
    <Alert
      status="info"
      title={title}
      data-testid={testId}
      description={
        <Flex direction="column" gap="2">
          <Text variant="body-small">{description}</Text>
          <ServerSignIn
            noun="connector"
            serverName={serverName}
            installation={installation}
          />
        </Flex>
      }
    />
  );
}
