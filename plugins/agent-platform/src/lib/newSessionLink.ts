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
 * The home screen's fragment parameter that prefills the composer's prompt:
 * `#prompt=<url-encoded brief>` (`linkedPromptOf`). In the fragment, so the
 * brief never reaches a server or its access logs. Never sent by itself: the
 * person reads, edits and starts. Dropped from the address once read, so a
 * reload does not bring it back over what the person has written since.
 */
export const NEW_SESSION_PROMPT_PARAM = 'prompt';

/**
 * A fragment's parts (`a=1&b`), each kept as written, and the prompt among
 * them: the raw `#prompt=` value (`null` without one) and the fragment
 * without it ('' when nothing else is left).
 */
export function splitPromptFragment(hash: string): {
  prompt: string | null;
  rest: string;
} {
  const parts = hash.replace(/^#/, '').split('&').filter(Boolean);
  const key = `${NEW_SESSION_PROMPT_PARAM}=`;
  const found = parts.find(part => part.startsWith(key));
  let prompt: string | null = null;
  if (found !== undefined) {
    try {
      prompt = decodeURIComponent(found.slice(key.length).replace(/\+/g, ' '));
    } catch {
      // A malformed escape: taken as written rather than dropped.
      prompt = found.slice(key.length);
    }
  }
  const rest = parts.filter(part => part !== found).join('&');
  return { prompt, rest: rest ? `#${rest}` : '' };
}

/**
 * Whether `url` (same origin) is a link to start a session: the home
 * screen (`home`) with an agent or a prompt. Agent replies open these in the
 * same tab; every other link opens a new one.
 */
export function isNewSessionLink(url: URL, home: string | undefined): boolean {
  if (home === undefined) {
    return false;
  }
  const trim = (path: string) => path.replace(/\/+$/, '') || '/';
  return (
    trim(url.pathname) === trim(home) &&
    (url.searchParams.has(NEW_SESSION_AGENT_PARAM) ||
      splitPromptFragment(url.hash).prompt !== null)
  );
}

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
 * The prompt a `#prompt=` value prefills: trimmed and cut to
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
 * installation first): the one with that id, else the first of its namespace
 * and name, for a link that names it as `namespace/name` or prefixes an
 * installation that is none of `installations` (an agent reads its
 * installation's name from agent-manager, which may call it otherwise than the
 * portal does). An installation the portal knows is never swapped for another.
 * Only agents `isOffered` accepts count.
 */
export function findLinkedAgent<T extends AgentRow>(
  agents: readonly T[],
  ref: string | null,
  isOffered: (agent: T) => boolean,
  installations: readonly string[] = [],
): T | undefined {
  if (!ref) {
    return undefined;
  }
  const offered = agents.filter(isOffered);
  const byId = offered.find(agent => agent.id === ref);
  if (byId) {
    return byId;
  }
  const parts = ref.split('/');
  if (parts.length === 3 && installations.includes(parts[0])) {
    return undefined;
  }
  const namespacedName = parts.slice(-2).join('/');
  return parts.length === 2 || parts.length === 3
    ? offered.find(
        agent => `${agent.namespace}/${agent.technicalName}` === namespacedName,
      )
    : undefined;
}
