import { useState } from 'react';
import { Button } from '@backstage/ui';
import { EmptyStateCard } from '@giantswarm/backstage-plugin-ui-react';

import { PortalSessionEndedAlert } from '../PortalSessionEndedAlert';
import type {
  ToolchainCheckFailure,
  UncheckedToolchainInstallation,
} from '../../hooks/useToolchainManager';

export type ToolchainsUncheckedProps = {
  /** The installations whose muster could not say, and why. */
  unchecked: UncheckedToolchainInstallation[];
  /** Asks them again. */
  onRetry: () => Promise<void>;
};

/** "meadow", "meadow and fennel", "meadow, fennel and tarragon". */
function namesOf(installations: string[]): string {
  return installations.length > 1
    ? `${installations.slice(0, -1).join(', ')} and ${installations[installations.length - 1]}`
    : installations[0];
}

const SENTENCES: Record<ToolchainCheckFailure, (names: string) => string> = {
  tokenRejected: names => `Muster on ${names} refused your sign-in.`,
  signedOut: names =>
    `Your portal session has ended, so Muster on ${names} could not be asked. Sign in again.`,
  notAnswering: names => `Muster on ${names} did not answer.`,
};

/**
 * The toolchain pages' state when no installation in scope is known to run
 * the toolchain-manager and at least one could not be asked: says, per
 * cause, what happened, and offers to ask again.
 */
export function ToolchainsUnchecked({
  unchecked,
  onRetry,
}: ToolchainsUncheckedProps) {
  const [isRetrying, setRetrying] = useState(false);
  // Only the portal session is in the way: a retry cannot help, a sign-in
  // does.
  if (
    unchecked.length > 0 &&
    unchecked.every(entry => entry.failure === 'signedOut')
  ) {
    return <PortalSessionEndedAlert />;
  }
  const description = (['tokenRejected', 'signedOut', 'notAnswering'] as const)
    .map(failure => {
      const names = unchecked
        .filter(entry => entry.failure === failure)
        .map(entry => entry.installation);
      return names.length > 0 ? SENTENCES[failure](namesOf(names)) : undefined;
    })
    .filter(Boolean)
    .join(' ');

  return (
    <EmptyStateCard
      title="Toolchains could not be checked"
      description={description}
      actions={
        <Button
          variant="secondary"
          isDisabled={isRetrying}
          onPress={() => {
            setRetrying(true);
            onRetry().finally(() => setRetrying(false));
          }}
        >
          {isRetrying ? 'Retrying…' : 'Retry'}
        </Button>
      }
    />
  );
}
