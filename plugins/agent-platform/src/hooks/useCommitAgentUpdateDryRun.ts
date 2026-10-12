import type { AgentSkillEntry, AgentUpdate } from '../lib/agentManager';
import { musterCommitAgentUpdateDryRunQueryKey } from '../lib/queryKeys';
import {
  useAgentManagerDryRun,
  type AgentManagerDryRunState,
} from './useAgentManagerDryRun';

/** What the commit dry run of an update is read for: the skills it would write. */
export type CommitAgentUpdateDryRun = {
  skills: AgentSkillEntry[] | undefined;
};

/**
 * `update_agent` with `mode: commit` and `dryRun`: the update an agent applied
 * from git would get through a pull request, without opening it. Unlike
 * `validate_agent`, agent-manager reads the repository as the person here, so
 * it refuses up front what the pull request would, such as a release whose
 * file is not in agent-manager's directory. Only the skills are kept: the
 * answer also carries every file's full content.
 *
 * `undefined` disables the read.
 */
export function useCommitAgentUpdateDryRun(
  installation: string | undefined,
  update: AgentUpdate | undefined,
): AgentManagerDryRunState<CommitAgentUpdateDryRun> {
  const signature = update ? JSON.stringify(update) : '';
  return useAgentManagerDryRun(
    installation,
    musterCommitAgentUpdateDryRunQueryKey(installation ?? '', signature),
    update
      ? async client => {
          const result = await client.dryRunCommitUpdateAgent(update);
          return {
            skills: result.after?.skills as AgentSkillEntry[] | undefined,
          };
        }
      : undefined,
  );
}
