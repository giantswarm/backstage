/**
 * The sign-in tool a toolset needs: muster's `core_auth_login`, the only way
 * an agent's session starts the sign-in to a connector muster signs in to per
 * session or per person. A toolset naming such a connector without it leaves
 * the agent unable to ask (giantswarm/giantswarm#38774): muster refuses the
 * call as outside the toolset, and the agent can only tell the person to sign
 * in "from your client".
 *
 * The wizard adds it on its own while the toolset needs it, the way
 * `preset:read-only` already carries it (muster annotates it read-only). It
 * only starts a sign-in to a connector, as the person, and the toolset still
 * bounds which of its tools the agent may call.
 *
 * Pure functions over plain data, like `lib/toolset`.
 */

import {
  MAX_INLINE_SELECTORS,
  PRESET_FULL,
  PRESET_READ_ONLY,
  parseSelector,
  presetNameOf,
  PRESET_NONE,
  type ServerInfo,
  serverOfTool,
  surfaceName,
} from './toolset';

/** muster's tool that starts a connector sign-in for the session. */
export const SIGN_IN_TOOL = 'core_auth_login';

/** The selector that adds {@link SIGN_IN_TOOL} to a toolset. */
export const SIGN_IN_TOOL_SELECTOR = `tool:${SIGN_IN_TOOL}`;

/**
 * The built-in presets that include the sign-in tool: `read-only` through the
 * tool's read-only annotation, `full` through everything.
 */
const PRESETS_WITH_SIGN_IN: ReadonlySet<string> = new Set([
  PRESET_READ_ONLY,
  PRESET_FULL,
]);

/**
 * The presets of a selection whose coverage of the sign-in tool is not known
 * without asking muster: an installation's own. The built-ins are known.
 */
export function presetsToAsk(selection: readonly string[]): string[] {
  return selection.filter(
    selector =>
      presetNameOf(selector) !== undefined &&
      !PRESETS_WITH_SIGN_IN.has(selector) &&
      selector !== PRESET_NONE,
  );
}

/**
 * The connectors (surface names) of a selection that a session signs in to
 * through the sign-in tool: those its `server:` selectors name, and those its
 * `tool:` selectors' tools belong to. In selection order, each once.
 */
export function connectorsNeedingSignIn(
  selection: readonly string[],
  servers: readonly ServerInfo[],
): string[] {
  const needing = new Set(
    servers.filter(server => server.signInTool).map(surfaceName),
  );
  const found: string[] = [];
  for (const selector of selection) {
    const parsed = parseSelector(selector);
    let surface: string | undefined;
    if (parsed?.kind === 'server') {
      surface = parsed.name;
    } else if (parsed?.kind === 'tool' && parsed.name !== SIGN_IN_TOOL) {
      surface = serverOfTool({ name: parsed.name }, [...servers]);
    }
    if (surface && needing.has(surface) && !found.includes(surface)) {
      found.push(surface);
    }
  }
  return found;
}

/**
 * What the toolset does about the sign-in tool:
 *
 * - `not-needed`: no selected connector signs in through it.
 * - `present`: the selection names it itself.
 * - `covered`: a preset of the selection includes it.
 * - `added`: the wizard adds it, and drops it again with the last connector
 *   that needed it.
 * - `removed`: the person removed it while a connector still needs it.
 * - `no-room`: the selection is at the inline cap, with no room for it.
 */
export type SignInToolStatus =
  'not-needed' | 'present' | 'covered' | 'added' | 'removed' | 'no-room';

export type SignInTool = {
  status: SignInToolStatus;
  /** The selected connectors that sign in through it (surface names). */
  connectors: string[];
  /** The selection with the sign-in tool when the wizard adds it. */
  toolset: string[];
};

/**
 * The sign-in tool for a selection. `declined` is the person's removal of it,
 * kept by the form; `presetsInclude` whether muster resolved one of the
 * installation's own presets of the selection to include it.
 */
export function signInToolOf({
  selection,
  servers,
  declined,
  presetsInclude,
}: {
  selection: string[];
  servers: readonly ServerInfo[];
  declined: boolean;
  presetsInclude: boolean;
}): SignInTool {
  const connectors = connectorsNeedingSignIn(selection, servers);
  const unchanged = (status: SignInToolStatus): SignInTool => ({
    status,
    connectors,
    toolset: selection,
  });
  if (connectors.length === 0) {
    return unchanged('not-needed');
  }
  if (selection.includes(SIGN_IN_TOOL_SELECTOR)) {
    return unchanged('present');
  }
  if (
    presetsInclude ||
    selection.some(selector => PRESETS_WITH_SIGN_IN.has(selector))
  ) {
    return unchanged('covered');
  }
  if (declined) {
    return unchanged('removed');
  }
  if (selection.length >= MAX_INLINE_SELECTORS) {
    return unchanged('no-room');
  }
  return {
    status: 'added',
    connectors,
    toolset: [...selection, SIGN_IN_TOOL_SELECTOR],
  };
}
