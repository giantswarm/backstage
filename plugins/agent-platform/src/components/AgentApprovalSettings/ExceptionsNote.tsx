import { Alert } from '@backstage/ui';

import type { AgentApprovalGrant } from '../../lib/agentManager';
import { entryLabel, exceptionsNote } from '../../lib/agentApproval';

/**
 * Before a save: the exceptions it drops that the person did not change —
 * those of connectors they are no admin of (or all, for a save to Git) —
 * in the PRD's words. Nothing when there are none.
 */
export function ExceptionsNote({
  notAdmin,
  viaGit = [],
  labelOf,
}: {
  notAdmin: readonly AgentApprovalGrant[];
  viaGit?: readonly AgentApprovalGrant[];
  labelOf: (server: string) => string;
}) {
  const note = exceptionsNote(notAdmin, labelOf);
  if (!note && viaGit.length === 0) {
    return null;
  }
  const description = [
    note,
    viaGit.length > 0 &&
      `A pull request carries no exceptions, so merging it removes ${viaGit
        .map(grant => entryLabel(grant.entry, labelOf))
        .join(', ')} too.`,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <Alert
      status="warning"
      title="Saving removes exceptions"
      description={description}
    />
  );
}
