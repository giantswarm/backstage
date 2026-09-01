import { useCallback } from 'react';
import useLocalStorageState from 'use-local-storage-state';
import type { AgentRow } from '../components/AgentsDataProvider';

/**
 * Same `gs-` prefix as `useTableColumns`, which is the repo's other piece of
 * remembered UI state. Not namespaced per user: localStorage is already
 * per-browser-profile, and the value is an agent reference rather than anything
 * about the user.
 */
const STORAGE_KEY = 'gs-agent-platform-last-agent';

/**
 * The agent the user last started a session with.
 *
 * This is the composer's default, and it exists because the prototype's default
 * does not survive the port: there, one canonical "general purpose agent" is
 * pinned as the default, and we have no equivalent — just however many agents the
 * fleet happens to run, across installations and namespaces.
 *
 * The alternatives were worse. Preselecting the first agent alphabetically always
 * offers *something*, but the something is arbitrary, and a hasty Cmd+Enter then
 * spends money on an agent that can act on a cluster. Preselecting nothing every
 * time is safe but makes the common case — the same agent as last time — cost two
 * extra clicks. Remembering gets both: the first session of all is an explicit
 * choice, and every one after it is one keystroke.
 *
 * Stored as the {@link AgentRow} `id` (installation/namespace/name) rather than
 * the row, so a remembered agent is re-resolved against the live fleet on every
 * visit. An agent that has since been deleted, or whose installation is
 * unreachable, resolves to `undefined` and the composer asks for a choice —
 * which is the point of storing a reference rather than a copy.
 */
export function useLastUsedAgent(agents: AgentRow[]) {
  const [lastUsedId, setLastUsedId] = useLocalStorageState<string | undefined>(
    STORAGE_KEY,
    { defaultValue: undefined },
  );

  // Only a ready agent is offered as the default. A remembered one that has since
  // stopped being ready is still listed in the picker (disabled, with the reason),
  // so preselecting it would present a default that cannot be started.
  const lastUsedAgent = agents.find(
    agent => agent.id === lastUsedId && agent.readiness === 'ready',
  );

  const rememberAgent = useCallback(
    (agent: AgentRow) => setLastUsedId(agent.id),
    [setLastUsedId],
  );

  return { lastUsedAgent, rememberAgent };
}
