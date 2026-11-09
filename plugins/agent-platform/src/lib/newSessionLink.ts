import type { AgentRow } from '../components/AgentsDataProvider';

/**
 * The home screen's query parameter naming the agent to preselect in its
 * composer: an `AgentRow` id (`installation/namespace/name`), which is no
 * personal data — the same reference the picker's own state holds. A link
 * that cannot know the installation (one an agent writes) may name the agent
 * as `namespace/name` alone ({@link findLinkedAgent}).
 */
export const NEW_SESSION_AGENT_PARAM = 'agent';

/**
 * The home screen's query parameter that prefills the composer's prompt
 * (`linkedPromptOf`). Never sent by itself: the person reads, edits and
 * starts. Dropped from the address once read, so a reload does not bring it
 * back over what the person has written since.
 */
export const NEW_SESSION_PROMPT_PARAM = 'prompt';

/** The longest prompt a link prefills; the rest is cut. */
export const LINKED_PROMPT_MAX_LENGTH = 2000;

/**
 * Where "New session" leads: the shell's home (`home`, the new-session
 * screen, as the app binds it), with `agent` preselected when given. The home
 * resolves the id against the live fleet and falls back to its usual default
 * when it names no startable agent.
 */
export function newSessionHref(
  home: string,
  agent?: Pick<AgentRow, 'id'>,
): string {
  return agent
    ? `${home}?${NEW_SESSION_AGENT_PARAM}=${encodeURIComponent(agent.id)}`
    : home;
}

/**
 * The prompt a `?prompt=` value prefills: trimmed and cut to
 * {@link LINKED_PROMPT_MAX_LENGTH} characters (code points); `undefined` for
 * none or a blank one.
 */
export function linkedPromptOf(raw: string | null): string | undefined {
  // Cut by code points, so an emoji at the limit is not split in half.
  const prompt = Array.from(raw?.trim() ?? '')
    .slice(0, LINKED_PROMPT_MAX_LENGTH)
    .join('')
    .trim();
  return prompt ? prompt : undefined;
}

/**
 * The agent a `?agent=` value names among `agents` (in their order, home
 * installation first): the one with that id, else — for a link that names it
 * as `namespace/name` — the first of that namespace and name. Only agents
 * `isOffered` accepts count.
 */
export function findLinkedAgent<T extends AgentRow>(
  agents: readonly T[],
  ref: string | null,
  isOffered: (agent: T) => boolean,
): T | undefined {
  if (!ref) {
    return undefined;
  }
  const offered = agents.filter(isOffered);
  return (
    offered.find(agent => agent.id === ref) ??
    offered.find(agent => `${agent.namespace}/${agent.technicalName}` === ref)
  );
}
