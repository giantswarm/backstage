import type { AgentRow } from '../components/AgentsDataProvider';

/**
 * The home screen's query parameter naming the agent to preselect in its
 * composer: an `AgentRow` id (`installation/namespace/name`), which is no
 * personal data — the same reference the picker's own state holds. A link
 * that cannot know the installation (one an agent writes) may name the agent
 * as `namespace/name` alone ({@link resolveLinkedAgent}).
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

/** What a `?agent=` value names among the agents listed ({@link resolveLinkedAgent}). */
export type LinkedAgent<T extends AgentRow> =
  /** An agent that can start a session. */
  | { status: 'found'; agent: T }
  /** An agent that is listed but cannot start a session. */
  | { status: 'unavailable'; agent: T }
  /** Several agents of that namespace and name, on different installations. */
  | { status: 'ambiguous' }
  /**
   * No agent listed; `installation` is the one the link names, when the
   * portal knows it.
   */
  | { status: 'missing'; installation?: string };

/**
 * The agent a `?agent=` value names among `agents` (in their order, home
 * installation first):
 *
 * - the agent with that id;
 * - for `namespace/name`, or `installation/namespace/name` where
 *   `installation` is none of `installations` (every installation the portal
 *   knows), the one agent of that namespace and name. An agent reads its
 *   installation's name from agent-manager, which may call it otherwise than
 *   the portal does. Several such agents are `ambiguous`: no installation is
 *   picked for the person.
 *
 * An installation the portal knows is never swapped for another. `isOffered`
 * tells an agent that can start a session from one that cannot.
 */
export function resolveLinkedAgent<T extends AgentRow>(
  agents: readonly T[],
  ref: string,
  isOffered: (agent: T) => boolean,
  installations: readonly string[],
): LinkedAgent<T> {
  const verdict = (agent: T): LinkedAgent<T> =>
    isOffered(agent)
      ? { status: 'found', agent }
      : { status: 'unavailable', agent };
  const byId = agents.find(agent => agent.id === ref);
  if (byId) {
    return verdict(byId);
  }
  const parts = ref.split('/');
  if (parts.length !== 2 && parts.length !== 3) {
    return { status: 'missing' };
  }
  if (parts.length === 3 && installations.includes(parts[0])) {
    return { status: 'missing', installation: parts[0] };
  }
  const namespacedName = parts.slice(-2).join('/');
  const matches = agents.filter(
    agent => `${agent.namespace}/${agent.technicalName}` === namespacedName,
  );
  if (matches.length === 0) {
    return { status: 'missing' };
  }
  return matches.length === 1 ? verdict(matches[0]) : { status: 'ambiguous' };
}

/** The longest `?agent=` value a notice repeats. */
export const LINKED_AGENT_SHOWN_MAX_LENGTH = 80;

const KUBERNETES_NAME = '[a-z0-9]([-a-z0-9.]*[a-z0-9])?';
const AGENT_REF = new RegExp(`^${KUBERNETES_NAME}(/${KUBERNETES_NAME}){1,2}$`);

/**
 * A `?agent=` value as a notice may repeat it: only when it reads as an agent
 * reference (Kubernetes names, `namespace/name` or
 * `installation/namespace/name`), cut to
 * {@link LINKED_AGENT_SHOWN_MAX_LENGTH} characters; `undefined` otherwise, so a
 * crafted link cannot put its own sentence into the portal's warning.
 */
export function shownLinkedAgentRef(ref: string): string | undefined {
  if (!AGENT_REF.test(ref)) {
    return undefined;
  }
  return ref.length > LINKED_AGENT_SHOWN_MAX_LENGTH
    ? `${ref.slice(0, LINKED_AGENT_SHOWN_MAX_LENGTH - 1)}…`
    : ref;
}
