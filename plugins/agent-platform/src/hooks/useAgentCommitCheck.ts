import { useMemo } from 'react';

import {
  missingReleaseFile,
  type AgentUpdate,
  type MissingReleaseFile,
} from '../lib/agentManager';
import type { AgentManagerReadFailure } from './useAgentManagerAgent';
import { useCommitAgentUpdateDryRun } from './useCommitAgentUpdateDryRun';

/**
 * Whether agent-manager can open a pull request for the agent, asked before
 * the person starts:
 *
 * - `off`: not asked (the agent is not written in mode `commit`).
 * - `checking`: the dry run is in flight.
 * - `passed`: agent-manager read the repository and would open one.
 * - `release-outside`: the agent's release is not in agent-manager's own
 *   file, so it never will (`missingReleaseFile`).
 * - `connect`: the pull request needs the person's GitHub authorization, or
 *   their muster session is not connected to agent-manager at all; both are
 *   fixed by connecting agent-manager in muster.
 * - `unchecked`: the dry run failed some other way. It says nothing about the
 *   write, so callers go ahead and leave any refusal to the write itself.
 */
export type AgentCommitCheck =
  | { status: 'off' | 'checking' | 'passed' }
  | {
      status: 'release-outside';
      missing: MissingReleaseFile;
      /** agent-manager's refusal, verbatim. */
      message: string;
    }
  | {
      status: 'connect';
      /** `auth_required`: connected, but without GitHub authorization. */
      github: boolean;
      message: string;
    }
  | { status: 'unchecked'; failure?: AgentManagerReadFailure };

/**
 * `update_agent` in mode `commit` with `dryRun` and nothing to change: it
 * reads the repository as the person and refuses up front what a pull request
 * for the agent (an edit, or a delete, which runs the same check) would be
 * refused for, writing nothing. About 1–4 s, and a GitHub read each time, so
 * it is asked where the person is about to write, never on a page view.
 *
 * Shares its query with `useCommitAgentUpdateDryRun`, so the edit page and the
 * delete dialog of one agent ask once. A muster sign-in invalidates every
 * `['muster', …]` query, which asks again.
 */
export function useAgentCommitCheck(
  installation: string | undefined,
  namespace: string,
  name: string,
  enabled: boolean,
): AgentCommitCheck {
  const update = useMemo<AgentUpdate | undefined>(
    () => (enabled ? { namespace, name } : undefined),
    [enabled, namespace, name],
  );
  const { result, isLoading, failure } = useCommitAgentUpdateDryRun(
    installation,
    update,
  );

  if (!enabled) {
    return { status: 'off' };
  }
  if (failure) {
    const missing = missingReleaseFile(failure);
    if (missing) {
      return { status: 'release-outside', missing, message: failure.message };
    }
    if (failure.kind === 'not-connected' || failure.code === 'auth_required') {
      return {
        status: 'connect',
        github: failure.code === 'auth_required',
        message: failure.message,
      };
    }
    return { status: 'unchecked', failure };
  }
  if (result) {
    return { status: 'passed' };
  }
  // No agent-manager to ask on this installation: nothing is in flight.
  return isLoading ? { status: 'checking' } : { status: 'unchecked' };
}
