import { Alert } from '@backstage/ui';
import { musterSignInRequiredOf } from '@giantswarm/backstage-plugin-muster';

import { TOOLCHAIN_MANAGER_SERVER } from '../../lib/toolchainManager';
import { ServerSignInCard } from '../ServerSignInCard';

export type ToolchainReadFailureProps = {
  installation: string;
  error: Error;
  /** What could not be read: "The toolchain sources could not be read". */
  title: string;
  /** Reads again, once the person signed in to the toolchain-manager. */
  onRetry: () => void;
};

/**
 * A failed read of the toolchain-manager. One muster refused because the
 * person has not signed in to the toolchain-manager yet offers that sign-in,
 * not the refusal's text; any other failure says what could not be read.
 */
export function ToolchainReadFailure({
  installation,
  error,
  title,
  onRetry,
}: ToolchainReadFailureProps) {
  if (musterSignInRequiredOf(error)) {
    return (
      <ServerSignInCard
        serverName={TOOLCHAIN_MANAGER_SERVER}
        installation={installation}
        title="Sign in to use toolchains"
        data-testid="toolchains-sign-in"
        description={`Toolchains on ${installation} are read with your own sign-in, and you have not signed in to them there yet. Sign in once; they open here.`}
        onSignedIn={onRetry}
      />
    );
  }
  return <Alert status="danger" title={title} description={error.message} />;
}
