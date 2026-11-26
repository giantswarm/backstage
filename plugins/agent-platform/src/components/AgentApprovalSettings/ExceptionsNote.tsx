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
  unchecked = [],
  labelOf,
}: {
  notAdmin: readonly AgentApprovalGrant[];
  viaGit?: readonly AgentApprovalGrant[];
  /** Grants of connectors whose admin rights could not be checked. */
  unchecked?: readonly AgentApprovalGrant[];
  labelOf: (server: string) => string;
}) {
  const note = exceptionsNote(notAdmin, labelOf);
  if (!note && viaGit.length === 0 && unchecked.length === 0) {
    return null;
  }
  const description = [
    note,
    viaGit.length > 0 &&
      `A pull request carries no exceptions, so merging it removes ${viaGit
        .map(grant => entryLabel(grant.entry, labelOf))
        .join(', ')} too.`,
    unchecked.length > 0 &&
      `Could not check whether you are an admin of ${[
        ...new Set(unchecked.map(grant => labelOf(grant.server))),
      ].join(', ')}, so saving may remove ${unchecked
        .map(grant => entryLabel(grant.entry, labelOf))
        .join(', ')}.`,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <Alert
      status="warning"
      title={
        note || viaGit.length > 0
          ? 'Saving removes exceptions'
          : 'Saving may remove exceptions'
      }
      description={description}
    />
  );
}
