import { useEffect, useRef } from 'react';
import { Alert, Flex, Text } from '@backstage/ui';
import {
  ServerSignIn,
  useServerSignIn,
} from '@giantswarm/backstage-plugin-muster';

import { useMusterPluginApi } from '../../hooks/useMusterPluginApi';
import { WORKSPACE_MANAGER_SERVER } from '../../lib/workspaceManager';

export type WorkspaceManagerSignInProps = {
  installation: string;
  /** Called once the person's muster session signed in to workspace-manager. */
  onSignedIn: () => void;
};

/**
 * In place of a refused read of the person's workspaces: muster's session has
 * not signed in to workspace-manager yet, so nothing of it can be read. One
 * card with muster's sign-in; the read runs again once it lands.
 */
export function WorkspaceManagerSignIn(props: WorkspaceManagerSignInProps) {
  return useMusterPluginApi() ? <SignInCard {...props} /> : null;
}

function SignInCard({ installation, onSignedIn }: WorkspaceManagerSignInProps) {
  const { needsLogin } = useServerSignIn(
    WORKSPACE_MANAGER_SERVER,
    installation,
    { noun: 'connector' },
  );
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
      title="Sign in to use workspaces"
      data-testid="workspaces-sign-in"
      description={
        <Flex direction="column" gap="2">
          <Text variant="body-small">
            Workspaces are read as you, through workspace-manager with your own
            sign-in, and your session on {installation} has not signed in to it
            yet. Sign in once; the list opens here.
          </Text>
          <ServerSignIn
            noun="connector"
            serverName={WORKSPACE_MANAGER_SERVER}
            installation={installation}
          />
        </Flex>
      }
    />
  );
}
