import { Alert } from '@backstage/ui';

import { PLATFORM_EGRESS_COPY } from '../../lib/egressCopy';
import type { DroppedEgress } from '../NewAgentFormProvider';

/**
 * What a move to a coding Harness took out of the agent form, said once. The
 * live region stays mounted and only its content changes, so a screen reader
 * announces the notice when it appears.
 */
export function DroppedEgressNotice({
  runtime,
  dropped,
}: {
  /** The Harness as a person names it; nothing is said without it. */
  runtime: string | undefined;
  dropped: DroppedEgress | undefined;
}) {
  return (
    <div role="status">
      {runtime && dropped && (
        <Alert
          status="info"
          title={PLATFORM_EGRESS_COPY.droppedTitle}
          description={PLATFORM_EGRESS_COPY.dropped(
            runtime,
            dropped.origins,
            dropped.policies,
          )}
        />
      )}
    </div>
  );
}
