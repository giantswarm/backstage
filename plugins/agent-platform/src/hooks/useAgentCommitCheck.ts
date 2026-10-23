import { useMemo } from 'react';
import { useServerNeedsSignIn } from '@giantswarm/backstage-plugin-muster';

import {
  AGENT_MANAGER_SERVER,
  missingGitHubAuthorization,
  missingReleaseFile,
  type AgentUpdate,
  type MissingReleaseFile,
} from '../lib/agentManager';
import type { AgentManagerReadFailure } from './useAgentManagerAgent';
import { useCommitAgentUpdateDryRun } from './useCommitAgentUpdateDryRun';

/**
 * What a refusal of a write in mode `commit` (or of its dry run) means for the
 * person:
 *
 * - `release-outside`: the agent's release is not in agent-manager's own file,
 *   so no pull request will ever be opened for it (`missingReleaseFile`).
 * - `connect`: a sign-in to agent-manager in muster fixes it: the muster
 *   session is not connected to agent-manager, or (`github`) the call carried
 *   no GitHub authorization (`missingGitHubAuthorization`).
 * - `other`: anything else, a token GitHub refused included (an App not
 *   installed on the repository, no push access), shown in agent-manager's
 *   words.
 *
 * The one classification the edit page, the edit review and the Delete dialog
 * share, so the parsing agent-manager#144 will replace lives here alone.
 */
export type CommitFailure =
  | { kind: 'release-outside'; missing: MissingReleaseFile; message: string }
  | { kind: 'connect'; github: boolean; message: string }
  | { kind: 'other'; message: string };

export function classifyCommitFailure(
  failure: AgentManagerReadFailure | undefined,
): CommitFailure | undefined {
  if (!failure) {
    return undefined;
  }
  const { message } = failure;
  const missing = missingReleaseFile(failure);
  if (missing) {
    return { kind: 'release-outside', missing, message };
  }
  if (failure.kind === 'not-connected') {
    return { kind: 'connect', github: false, message };
  }
  if (missingGitHubAuthorization(failure)) {
    return { kind: 'connect', github: true, message };
  }
  return { kind: 'other', message };
}

/**
 * Whether agent-manager can open a pull request for the agent, asked before
 * the person starts:
 *
 * - `off`: not asked (the agent is not written in mode `commit`).
 * - `checking`: the dry run is in flight, or asked again.
 * - `passed`: agent-manager read the repository and would open one.
 * - `release-outside`, `connect`: as {@link CommitFailure}. `connect` for the
 *   GitHub authorization only while muster reports agent-manager as waiting
 *   for the person's sign-in, the one state a sign-in changes.
 * - `unchecked`: anything else. It says nothing certain about the write, so
 *   callers go ahead and leave the answer to the write itself.
 */
export type AgentCommitCheck =
  | { status: 'off' | 'checking' | 'passed' | 'unchecked' }
  | { status: 'release-outside'; missing: MissingReleaseFile; message: string }
  | { status: 'connect'; github: boolean; message: string };

/**
 * `update_agent` in mode `commit` with `dryRun` and nothing to change: it
 * reads the repository as the person and refuses up front what a pull request
 * for the agent (an edit, or a delete, which runs the same check) would be
 * refused for, writing nothing. About 1–4 s, and a GitHub read each time, so
 * it is asked where the person is about to write, never on a page view.
 *
 * Asked afresh whenever a reader mounts: an answer cached by an earlier visit
 * or the other surface does not count. A muster sign-in invalidates every
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
  const { result, isLoading, isFetching, failure } = useCommitAgentUpdateDryRun(
    installation,
    update,
    { freshOnMount: true },
  );
  const needsSignIn = useServerNeedsSignIn(AGENT_MANAGER_SERVER, installation, {
    enabled,
  });

  if (!enabled) {
    return { status: 'off' };
  }
  if (isLoading || isFetching) {
    return { status: 'checking' };
  }
  const refused = classifyCommitFailure(failure);
  if (refused?.kind === 'release-outside') {
    return {
      status: 'release-outside',
      missing: refused.missing,
      message: refused.message,
    };
  }
  if (refused?.kind === 'connect') {
    if (refused.github && needsSignIn === undefined) {
      return { status: 'checking' };
    }
    // Connected, or nothing to sign in to: a sign-in would change nothing,
    // so the write answers for itself.
    if (refused.github && !needsSignIn) {
      return { status: 'unchecked' };
    }
    return {
      status: 'connect',
      github: refused.github,
      message: refused.message,
    };
  }
  if (refused || !result) {
    return { status: 'unchecked' };
  }
  return { status: 'passed' };
}
