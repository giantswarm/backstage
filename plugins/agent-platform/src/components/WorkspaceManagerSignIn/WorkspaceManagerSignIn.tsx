import { WORKSPACE_MANAGER_SERVER } from '../../lib/workspaceManager';
import { ServerSignInCard } from '../ServerSignInCard';

export type WorkspaceManagerSignInProps = {
  installation: string;
  /** Called once the person's muster session signed in to workspace-manager. */
  onSignedIn: () => void;
};

/**
 * In place of a refused read of the person's workspaces: muster's session has
 * not signed in to workspace-manager yet, so nothing of it can be read.
 */
export function WorkspaceManagerSignIn({
  installation,
  onSignedIn,
}: WorkspaceManagerSignInProps) {
  return (
    <ServerSignInCard
      serverName={WORKSPACE_MANAGER_SERVER}
      installation={installation}
      title="Sign in to use workspaces"
      data-testid="workspaces-sign-in"
      description={`Workspaces on ${installation} are read with your own sign-in, and you have not signed in to them there yet. Sign in once; the list opens here.`}
      onSignedIn={onSignedIn}
    />
  );
}
