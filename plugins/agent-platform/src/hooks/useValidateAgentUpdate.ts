import type { AgentUpdate, WriteMode } from '../lib/agentManager';
import { musterValidateAgentUpdateQueryKey } from '../lib/queryKeys';
import { useAgentManagerDryRun } from './useAgentManagerDryRun';
import type { ValidateAgentState } from './useValidateAgent';

/**
 * `validate_agent` with `update: true`: the dry run of an update — the values
 * and manifests agent-manager would write, every violation, and with
 * `refreshSkills` every git skill re-pinned to its default-branch head. Nothing
 * is written. Re-read whenever the update changes; never persisted.
 *
 * `undefined` disables the read: the edit form passes it while nothing has
 * changed yet, the Update skills dialog while it is closed. `mode` is the
 * write's: `commit` for an agent applied from git.
 */
export function useValidateAgentUpdate(
  installation: string | undefined,
  update: AgentUpdate | undefined,
  mode: WriteMode = 'apply',
): ValidateAgentState {
  const signature = update ? JSON.stringify({ mode, update }) : '';
  return useAgentManagerDryRun(
    installation,
    musterValidateAgentUpdateQueryKey(installation ?? '', signature),
    update ? client => client.validateUpdate(update, mode) : undefined,
  );
}
