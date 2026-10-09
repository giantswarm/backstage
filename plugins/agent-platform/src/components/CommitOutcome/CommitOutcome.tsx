import { Alert } from '@backstage/ui';

import type { CommitAgentResult } from '../../lib/agentManager';
import { ClusterManagerCommitOutcome } from '../ClusterManagerCommitOutcome';

/**
 * What agent-manager's `mode: commit` answered (giantswarm/agent-manager#24):
 * the pull request it opened as the person, in the shape every manager answers
 * it. Shared by every agent write that offers Commit — create, edit and
 * delete. The connect step (`auth_required`) is a refusal, shown as the
 * write's failure, never here.
 */
export function CommitOutcome({ result }: { result: CommitAgentResult }) {
  if (!result.commit) {
    return (
      <Alert
        status="info"
        title="Commit requested"
        description="agent-manager accepted the request and named no pull request."
      />
    );
  }
  return <ClusterManagerCommitOutcome commit={result.commit} />;
}
