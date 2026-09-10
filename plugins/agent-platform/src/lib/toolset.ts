/**
 * The toolset an agent declares: the selector grammar, the presets, how a
 * declared toolset is read back off an agent's carrier `RemoteMCPServer`,
 * and how muster's
 * resolution of one is grouped for display.
 *
 * A toolset is composition, not authorization: it bounds which of the
 * gateway's tools the agent's meta-tools can see and call, within whatever the
 * invoking person may reach. Nothing here says "restricted", "enforced" or
 * "permission", because none of that is what a toolset does.
 *
 * Pure functions over plain data, so the wizard step, the review page, the
 * detail card and the composer agree by construction and every rule is
 * testable without a DOM.
 */

import type {
  Agent,
  AgentMcpBinding,
  RemoteMCPServer,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  TOOL_GROUPS,
  type FilterToolsResponse,
  type ToolGroupKey,
  type ToolSummary,
  type ToolsetPreset,
} from '@giantswarm/backstage-plugin-muster';

/** The request header the Generic chart renders a toolset into. */
export const TOOLSET_HEADER = 'X-Muster-Toolset';

/**
 * Name of the muster gateway `RemoteMCPServer`: what the Generic chart's
 * per-agent carrier is a copy of, and the name a hand-written template binds
 * a shared gateway server by. Matched on the name alone, not the namespace —
 * bindings are same-namespace on API v2, and installations may place the
 * gateway wherever they like.
 */
export const MUSTER_MCP_SERVER_NAME = 'muster';

/** Inline selectors are capped; beyond this, the platform admin defines a preset. */
export const MAX_INLINE_SELECTORS = 32;

export const SELECTOR_KINDS = ['preset', 'server', 'workflow', 'tool'] as const;
export type SelectorKind = (typeof SELECTOR_KINDS)[number];

/** `<kind>:<exact name>`; a name never contains whitespace or a comma. */
export const SELECTOR_PATTERN = /^(preset|server|workflow|tool):[^\s,]+$/;

export const PRESET_READ_ONLY = 'preset:read-only';
export const PRESET_NONE = 'preset:none';
export const PRESET_FULL = 'preset:full';

/**
 * The presets built into muster — offered even when muster cannot be asked
 * (the muster plugin is not installed, or the aggregator predates toolsets).
 */
export const BUILT_IN_PRESETS: ToolsetPreset[] = [
  {
    name: 'read-only',
    description:
      "Every tool whose server marks it read-only, and every workflow whose steps only use such tools. Evaluated live, so it follows the servers' own annotations.",
    built_in: true,
  },
  {
    name: 'none',
    description:
      'No tools at all. The agent gets no gateway entry and chats from its prompt and skills alone.',
    built_in: true,
  },
  {
    name: 'full',
    description:
      "Everything the gateway exposes to whoever invokes the agent, including the platform administration tools. Today's unbounded behaviour, made explicit.",
    built_in: true,
  },
];

/** A parsed selector. */
export type Selector = { kind: SelectorKind; name: string };

export function parseSelector(raw: string): Selector | undefined {
  const match = SELECTOR_PATTERN.exec(raw);
  if (!match) {
    return undefined;
  }
  return {
    kind: match[1] as SelectorKind,
    name: raw.slice(match[1].length + 1),
  };
}

export function formatSelector(selector: Selector): string {
  return `${selector.kind}:${selector.name}`;
}

/**
 * Why a selector is not acceptable inline, in the words muster would use — or
 * `undefined` when it is fine. Mirrors the grammar the chart schema and
 * agent-manager enforce, so the wizard refuses what they would refuse.
 */
export function selectorProblem(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return 'A selector cannot be empty.';
  }
  if (trimmed.startsWith('toolset:')) {
    return `"${trimmed}" is reserved for shared toolsets, which do not exist yet.`;
  }
  if (trimmed.startsWith('label:')) {
    return `"${trimmed}" selects by label, which is allowed inside presets only. Ask a platform admin for a preset.`;
  }
  if (!SELECTOR_PATTERN.test(trimmed)) {
    return `"${trimmed}" is not a selector. Use preset:<name>, server:<name>, workflow:<name> or tool:<name> with the exact name.`;
  }
  return undefined;
}

/**
 * Everything wrong with a whole toolset, for the step to block Continue on.
 * Empty when the toolset is acceptable. An empty list is not reported here:
 * the step reads "nothing chosen yet" as its own state.
 */
export function toolsetProblems(selectors: string[]): string[] {
  const problems = selectors
    .map(selectorProblem)
    .filter((problem): problem is string => problem !== undefined);
  if (selectors.length > MAX_INLINE_SELECTORS) {
    problems.push(
      `${selectors.length} selectors is more than the ${MAX_INLINE_SELECTORS} a toolset may list inline. Define a preset for this selection and reference it instead.`,
    );
  }
  return problems;
}

/** Splits a rendered header back into its selectors (`a, b ,c` → `[a, b, c]`). */
export function parseToolsetHeader(value: string): string[] {
  return value
    .split(',')
    .map(part => part.trim())
    .filter(part => part !== '');
}

export function presetSelector(name: string): string {
  return `preset:${name}`;
}

/** The preset name of a `preset:` selector, else `undefined`. */
export function presetNameOf(selector: string): string | undefined {
  const parsed = parseSelector(selector);
  return parsed?.kind === 'preset' ? parsed.name : undefined;
}

/** The label the step and the detail card show for a preset. */
export function presetLabel(name: string): string {
  switch (name) {
    case 'read-only':
      return 'Read-only tools';
    case 'none':
      return 'No tools';
    case 'full':
      return 'Full gateway';
    case 'infrastructure':
      return 'Infrastructure';
    case 'agent-platform':
      return 'Agent Platform';
    default:
      return name;
  }
}

// Presets lead with the safe choices and end with the powerful one: the
// constrained agent is one click, the unbounded one takes deliberate effort
// past everything else. Installation-defined presets sit between the shipped
// ones and `full`, alphabetically.
const PRESET_RANK: Record<string, number> = {
  'read-only': 0,
  none: 1,
  infrastructure: 2,
  'agent-platform': 3,
};
const FULL_RANK = Number.MAX_SAFE_INTEGER;

export function orderPresets(presets: ToolsetPreset[]): ToolsetPreset[] {
  const rank = (preset: ToolsetPreset) =>
    preset.name === 'full' ? FULL_RANK : (PRESET_RANK[preset.name] ?? 100);
  return [...presets].sort(
    (a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name),
  );
}

/**
 * Merges what muster reports with the built-ins, so the three shipped presets
 * are always known even if an aggregator's list omits one, and muster's own
 * description wins when it has one.
 */
export function withBuiltInPresets(reported: ToolsetPreset[]): ToolsetPreset[] {
  const byName = new Map<string, ToolsetPreset>();
  for (const preset of BUILT_IN_PRESETS) {
    byName.set(preset.name, preset);
  }
  for (const preset of reported) {
    const known = byName.get(preset.name);
    byName.set(preset.name, {
      ...known,
      ...preset,
      description: preset.description || known?.description,
    });
  }
  return orderPresets([...byName.values()]);
}

/**
 * The presets the Tools step offers as cards: muster's list without `none`. On
 * the step, no tools is what the empty selection means — there is nothing to
 * pick for it, and a card for it among the presets read as one more thing to
 * add. `preset:none` stays what the wizard declares for the empty selection
 * ({@link declaredToolset}); it is just not a card.
 */
export function offeredPresets(presets: ToolsetPreset[]): ToolsetPreset[] {
  return presets.filter(preset => preset.name !== 'none');
}

/**
 * `full` stands alone: adding anything to "everything" changes nothing, so
 * choosing it replaces the selection and choosing anything else drops it.
 */
export const EXCLUSIVE_PRESETS: ReadonlySet<string> = new Set([PRESET_FULL]);

/**
 * Toggles one selector in the step's selection. `preset:none` is not a
 * selection on the step but the empty one ({@link declaredToolset}), so toggling
 * it clears the selection, and it never survives inside one.
 */
export function toggleSelector(current: string[], selector: string): string[] {
  if (selector === PRESET_NONE) {
    return [];
  }
  if (current.includes(selector)) {
    return current.filter(entry => entry !== selector);
  }
  if (EXCLUSIVE_PRESETS.has(selector)) {
    return [selector];
  }
  return [
    ...current.filter(
      entry => entry !== PRESET_NONE && !EXCLUSIVE_PRESETS.has(entry),
    ),
    selector,
  ];
}

/**
 * A selector list as the step holds it: without `preset:none`, because on the
 * step no tools is the empty selection. What a copied toolset passes through.
 */
export function normalizeSelection(selectors: string[]): string[] {
  return selectors.filter(selector => selector !== PRESET_NONE);
}

/**
 * The toolset the wizard declares for a selection. The empty selection is *no
 * tools*, declared as `preset:none`: an empty `toolset` list is a render error
 * in the chart and an absent value is the unscoped default, so "nothing chosen"
 * has to reach the release as the one selector that means nothing. Anything
 * else is declared as selected.
 */
export function declaredToolset(selection: string[]): string[] {
  return selection.length === 0 ? [PRESET_NONE] : selection;
}

/** What a toolset amounts to, for the loud labels. */
export type ToolsetShape = 'none' | 'full' | 'composed';

export function toolsetShape(selectors: string[]): ToolsetShape {
  if (selectors.length === 1 && selectors[0] === PRESET_NONE) {
    return 'none';
  }
  if (selectors.includes(PRESET_FULL)) {
    return 'full';
  }
  return 'composed';
}

/**
 * The toolset an agent declares, read off the `RemoteMCPServer` its gateway
 * binding names.
 *
 * - `declared`: the carrier carries the `X-Muster-Toolset` header the chart
 *   rendered from the `toolset` value.
 * - `implicit-full`: the agent binds the gateway but the carrier has no header
 *   — a hand-written template, or a release without the value. It reaches
 *   everything the gateway exposes to its invoker, and the page says so.
 * - `no-gateway`: no binding reaches the gateway, which is what `preset:none`
 *   renders to. The agent has no tools.
 * - `unresolved`: the agent binds the gateway, but the carrier named by the
 *   binding could not be read (not loaded yet, not readable, or missing), so
 *   nothing can be said about the toolset. Distinct from `implicit-full`: an
 *   unreadable carrier is not evidence of full access.
 */
export type DeclaredToolset =
  | { state: 'declared'; selectors: string[]; carrier: string }
  | { state: 'implicit-full'; carrier: string }
  | { state: 'no-gateway' }
  | { state: 'unresolved'; carrier: string };

/**
 * What the toolset read needs from a `RemoteMCPServer`. Structural so the read
 * is testable with bare objects and the roster can pass its cluster-wide list.
 */
export type ToolsetCarrier = Pick<
  RemoteMCPServer,
  'getName' | 'getNamespace' | 'getHeaderValue'
>;

/**
 * Whether an MCP binding reaches the muster gateway: the Generic chart renders
 * the gateway into a `RemoteMCPServer` **named after the agent** in its own
 * namespace (the per-agent toolset carrier), and a hand-written template may
 * still bind a shared gateway server by the conventional name. A name match,
 * like the detail page's Tool Explorer link: any other server is some other
 * MCP server, whatever its URL.
 */
export function isGatewayBinding(
  agent: Pick<Agent, 'getName'>,
  binding: AgentMcpBinding,
  gatewayName: string,
): boolean {
  const name = binding.server.name;
  return name === agent.getName() || name === gatewayName;
}

/** The agent's bindings that reach the gateway, in declaration order. */
export function gatewayBindings(
  agent: Pick<Agent, 'getName' | 'getMcpBindings'>,
  gatewayName: string,
): AgentMcpBinding[] {
  return agent
    .getMcpBindings()
    .filter(binding => isGatewayBinding(agent, binding, gatewayName));
}

/**
 * The toolset an agent declares: its gateway bindings, joined with the
 * `RemoteMCPServer`s of its namespace to read the `X-Muster-Toolset` header
 * off the carrier each binding names. `carriers` undefined means the servers
 * have not been read yet — every gateway binding is then `unresolved`, never
 * mistaken for implicit full access.
 */
export function toolsetOfAgent(
  agent: Pick<Agent, 'getName' | 'getNamespace' | 'getMcpBindings'>,
  gatewayName: string,
  carriers: readonly ToolsetCarrier[] | undefined,
): DeclaredToolset {
  const bindings = gatewayBindings(agent, gatewayName);
  if (bindings.length === 0) {
    return { state: 'no-gateway' };
  }
  const namespace = agent.getNamespace();
  let unresolved: string | undefined;
  for (const binding of bindings) {
    const carrierName = binding.server.name;
    const carrier = carriers?.find(
      server =>
        server.getName() === carrierName && server.getNamespace() === namespace,
    );
    if (!carrier) {
      unresolved ??= carrierName;
      continue;
    }
    const header = carrier.getHeaderValue(TOOLSET_HEADER);
    if (header !== undefined) {
      return {
        state: 'declared',
        selectors: parseToolsetHeader(header),
        carrier: carrierName,
      };
    }
  }
  return unresolved !== undefined
    ? { state: 'unresolved', carrier: unresolved }
    : { state: 'implicit-full', carrier: bindings[0].server.name };
}

/**
 * The declared toolset in a few words, for a table cell: the summary is the
 * cell's text, the detail its second line. The card on the detail page does the
 * resolving; this only says what the carrier declares.
 */
export function describeToolset(toolset: DeclaredToolset | undefined): {
  summary: string;
  detail?: string;
} {
  if (!toolset || toolset.state === 'unresolved') {
    return {
      summary: '—',
      detail: toolset ? `${toolset.carrier} not readable` : 'carrier not read',
    };
  }
  switch (toolset.state) {
    case 'no-gateway':
      return { summary: 'No tools' };
    case 'implicit-full':
      return { summary: 'Full gateway access', detail: 'no toolset declared' };
    default: {
      const shape = toolsetShape(toolset.selectors);
      if (shape === 'none') {
        return { summary: 'No tools', detail: PRESET_NONE };
      }
      if (shape === 'full') {
        return { summary: 'Full gateway access', detail: PRESET_FULL };
      }
      return {
        summary: toolset.selectors.join(', '),
        detail: `${toolset.selectors.length} selector${
          toolset.selectors.length === 1 ? '' : 's'
        }`,
      };
    }
  }
}

/**
 * What the grouping needs to know about one MCPServer CR. An adapter over the
 * muster plugin's `MCPServer`, kept structural so the grouping is testable
 * without building CRs.
 */
export interface ServerInfo {
  /** The CR name — what `server:<name>` selects for a single server. */
  name: string;
  /**
   * The family name, for a federated family whose members share one tool
   * surface. `server:<family>` selects the family; muster reports the family
   * as the tool's `server`.
   */
  family?: string;
  group: ToolGroupKey;
  /** The `x_<segment>` prefix muster gives this server's tools. */
  toolNamePrefix: string;
  /** The CR's `.status.state`, e.g. `Auth Required`. */
  state?: string;
  /** Whether the server declares per-user OAuth (`spec.auth.type: oauth`). */
  oauth: boolean;
}

/** The name a server surface goes by: the family for a family member, else the CR name. */
export function surfaceName(server: ServerInfo): string {
  return server.family ?? server.name;
}

/**
 * The server surface a tool belongs to, by muster's `server` field when the
 * aggregator reports one, else by the longest matching `x_<segment>` prefix
 * (the way the Tool Explorer attributes tools on older aggregators).
 */
export function serverOfTool(
  tool: Pick<ToolSummary, 'name' | 'server'>,
  servers: ServerInfo[],
): string | undefined {
  if (tool.server) {
    return tool.server;
  }
  let best: ServerInfo | undefined;
  for (const server of servers) {
    const prefix = server.toolNamePrefix;
    if (tool.name === prefix || tool.name.startsWith(`${prefix}_`)) {
      if (!best || prefix.length > best.toolNamePrefix.length) {
        best = server;
      }
    }
  }
  return best ? surfaceName(best) : undefined;
}

export function isCoreTool(tool: Pick<ToolSummary, 'name' | 'kind'>): boolean {
  return tool.kind === 'core' || (!tool.kind && tool.name.startsWith('core_'));
}

export function isWorkflowTool(
  tool: Pick<ToolSummary, 'name' | 'kind'>,
): boolean {
  return (
    tool.kind === 'workflow' ||
    (!tool.kind && tool.name.startsWith('workflow_'))
  );
}

/** The workflow name behind a `workflow_<name>` tool. */
export function workflowNameOf(toolName: string): string {
  return toolName.startsWith('workflow_')
    ? toolName.slice('workflow_'.length)
    : toolName;
}

/** The selector that picks exactly this catalogue entry. */
export function selectorForTool(
  tool: Pick<ToolSummary, 'name' | 'kind'>,
): string {
  return isWorkflowTool(tool)
    ? `workflow:${workflowNameOf(tool.name)}`
    : `tool:${tool.name}`;
}

export function isReadOnly(tool: Pick<ToolSummary, 'annotations'>): boolean {
  return tool.annotations?.readOnlyHint === true;
}

/**
 * Destructive only when the server does not also call the tool read-only: the
 * MCP spec defaults `destructiveHint` to true and defines it only for tools
 * that are not read-only, and servers do send both (agent-manager's
 * `get_agent` arrives with `readOnlyHint: true, destructiveHint: true`).
 */
export function isDestructive(tool: Pick<ToolSummary, 'annotations'>): boolean {
  return (
    tool.annotations?.destructiveHint === true &&
    tool.annotations?.readOnlyHint !== true
  );
}

/**
 * A group on the Tools step and the detail card: the muster plugin's three
 * server groups plus Workflows, which span servers and so are their own group.
 */
export type PickerGroupKey = ToolGroupKey | 'workflows';

/**
 * The picker's order — Infrastructure first, as the PRD lists the groups for
 * an author browsing tools; the MCP servers page leads with Agent Platform
 * (`TOOL_GROUP_ORDER` in the muster plugin). Same names, same membership.
 */
export const PICKER_GROUP_ORDER: readonly PickerGroupKey[] = [
  'infrastructure',
  'agent-platform',
  'registered',
  'workflows',
];

/** The display name — the muster plugin's for its three groups. */
export function toolGroupTitle(key: PickerGroupKey): string {
  return key === 'workflows' ? 'Workflows' : TOOL_GROUPS[key].title;
}

/** One server surface inside a group, with the tools listed for the caller. */
export interface ServerBucket {
  /** The surface name — `server:<name>` selects it. */
  name: string;
  /** Whether this is a federated family (several CRs, one surface). */
  isFamily: boolean;
  tools: ToolSummary[];
  /** The caller's session has not authenticated with this server, so its tools are not listed. */
  needsSignIn: boolean;
  /** Whether a person can sign in to it at all (a sigv4 server cannot). */
  canSignIn: boolean;
  /** `.status.state` of the CR (the worst one, for a family). */
  state?: string;
  /** Present when muster listed tools for a server no CR describes. */
  unknownServer: boolean;
}

export interface CatalogueGroup {
  key: PickerGroupKey;
  title: string;
  servers: ServerBucket[];
  /**
   * muster's own `core_*` tools, only under Agent Platform. Selectable
   * explicitly, never through a shipped preset except `full` — they manage the
   * platform itself, which is why they are set apart and warned about.
   */
  platformAdministration: ToolSummary[];
  /** Workflow tools, only under Workflows. */
  workflows: ToolSummary[];
}

/**
 * Arranges the catalogue the way the platform thinks about it: the three
 * server groups from the tool-group label, plus Workflows. Every CR the
 * installation has is listed — as an empty, sign-in-gated bucket when the
 * caller's session cannot see its tools — so an author can pick a whole server
 * they cannot browse themselves. Tools muster attributes to a server no CR
 * describes still appear (under Registered servers) so nothing is hidden.
 * Empty groups are dropped.
 */
export function buildCatalogue(
  tools: ToolSummary[],
  servers: ServerInfo[],
  serversRequiringAuth: string[],
): CatalogueGroup[] {
  const groups = new Map<PickerGroupKey, CatalogueGroup>();
  const group = (key: PickerGroupKey): CatalogueGroup => {
    const existing = groups.get(key);
    if (existing) {
      return existing;
    }
    const created: CatalogueGroup = {
      key,
      title: toolGroupTitle(key),
      servers: [],
      platformAdministration: [],
      workflows: [],
    };
    groups.set(key, created);
    return created;
  };

  // One bucket per surface, seeded from the CRs so unlisted servers exist.
  const buckets = new Map<string, ServerBucket & { group: ToolGroupKey }>();
  const needsAuth = new Set(serversRequiringAuth);
  // muster names family *members* in servers_requiring_auth (`kubernetes-a`),
  // while the surface a member belongs to is the family (`kubernetes`).
  const surfaceOfCr = new Map(
    servers.map(server => [server.name, surfaceName(server)] as const),
  );
  for (const server of servers) {
    const name = surfaceName(server);
    const existing = buckets.get(name);
    const needsSignIn =
      needsAuth.has(name) ||
      needsAuth.has(server.name) ||
      server.state === 'Auth Required';
    if (existing) {
      existing.isFamily = true;
      existing.needsSignIn = existing.needsSignIn || needsSignIn;
      existing.canSignIn = existing.canSignIn || server.oauth;
      existing.state = worstState(existing.state, server.state);
      continue;
    }
    buckets.set(name, {
      name,
      isFamily: server.family !== undefined,
      tools: [],
      needsSignIn,
      canSignIn: server.oauth || needsSignIn,
      state: server.state,
      unknownServer: false,
      group: server.group,
    });
  }

  for (const tool of tools) {
    if (isCoreTool(tool)) {
      group('agent-platform').platformAdministration.push(tool);
      continue;
    }
    if (isWorkflowTool(tool)) {
      group('workflows').workflows.push(tool);
      continue;
    }
    const surface = serverOfTool(tool, servers) ?? segmentOf(tool.name);
    let bucket = buckets.get(surface);
    if (!bucket) {
      bucket = {
        name: surface,
        isFamily: false,
        tools: [],
        needsSignIn: needsAuth.has(surface),
        canSignIn: needsAuth.has(surface),
        unknownServer: true,
        group: 'registered',
      };
      buckets.set(surface, bucket);
    }
    bucket.tools.push(tool);
  }

  // A server muster reports as needing auth but no CR and no tool named — not
  // a family member, whose sign-in state already sits on the family's bucket.
  for (const name of needsAuth) {
    if (!buckets.has(surfaceOfCr.get(name) ?? name)) {
      buckets.set(name, {
        name,
        isFamily: false,
        tools: [],
        needsSignIn: true,
        canSignIn: true,
        unknownServer: true,
        group: 'registered',
      });
    }
  }

  for (const bucket of buckets.values()) {
    const { group: key, ...rest } = bucket;
    // Tools listed means the session sees the server: the CR-level state is
    // then stale for this caller, and the sign-in offer would be misleading.
    const needsSignIn = rest.tools.length === 0 && rest.needsSignIn;
    group(key).servers.push({ ...rest, needsSignIn });
  }

  for (const entry of groups.values()) {
    entry.servers.sort((a, b) => a.name.localeCompare(b.name));
    for (const bucket of entry.servers) {
      bucket.tools.sort((a, b) => a.name.localeCompare(b.name));
    }
    entry.platformAdministration.sort((a, b) => a.name.localeCompare(b.name));
    entry.workflows.sort((a, b) => a.name.localeCompare(b.name));
  }

  return PICKER_GROUP_ORDER.map(key => groups.get(key)).filter(
    (entry): entry is CatalogueGroup =>
      entry !== undefined &&
      (entry.servers.length > 0 ||
        entry.platformAdministration.length > 0 ||
        entry.workflows.length > 0),
  );
}

/** The bare `<segment>` of an `x_<segment>_…` tool name, for an unattributed tool. */
function segmentOf(name: string): string {
  if (name.startsWith('x_')) {
    return name.slice(2).split('_')[0] || name;
  }
  return name.split('_')[0] || name;
}

const STATE_SEVERITY: Record<string, number> = {
  Failed: 4,
  Disconnected: 3,
  Stopped: 3,
  'Auth Required': 2,
  Connecting: 1,
  Starting: 1,
  Connected: 0,
  Running: 0,
};

function worstState(a?: string, b?: string): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return (STATE_SEVERITY[a] ?? 0) >= (STATE_SEVERITY[b] ?? 0) ? a : b;
}

/**
 * Whether the aggregator evaluated the toolset. An aggregator from before
 * toolsets ignores the argument and answers the unscoped catalogue without
 * echoing `toolset`; treating that answer as "the resolution" would show the
 * author the whole gateway as if their selection resolved to it.
 */
export function toolsetWasEvaluated(
  response: Pick<FilterToolsResponse, 'toolset'>,
): boolean {
  return Array.isArray(response.toolset);
}

/** Whether muster refused the toolset for naming a preset it does not know (D12). */
export function isUnknownPresetError(message: string): boolean {
  return /unknown preset/i.test(message);
}

/** The `server:` selectors of a toolset whose server the caller cannot see. */
export function unsignedServerSelectors(
  selectors: string[],
  catalogue: CatalogueGroup[],
): string[] {
  const gated = new Set(
    catalogue.flatMap(entry =>
      entry.servers.filter(bucket => bucket.needsSignIn).map(b => b.name),
    ),
  );
  return selectors.filter(selector => {
    const parsed = parseSelector(selector);
    return parsed?.kind === 'server' && gated.has(parsed.name);
  });
}

/** The whole-server selector of a bucket. */
export function serverSelector(name: string): string {
  return `server:${name}`;
}

/**
 * How many rows a list on the Tools step (and a section of the resolved list)
 * shows before asking for a click: a gateway lists hundreds of tools, and a
 * page that renders every one of them at once is the page nobody scrolls.
 */
export const INITIAL_ROWS = 20;

/**
 * Below this many workflows there is nothing to group — one short list reads
 * better than a handful of one-entry groups.
 */
export const WORKFLOW_GROUPING_MIN = 12;

/** The key of the group gathering workflows whose name prefix nothing else shares. */
export const OTHER_WORKFLOWS_KEY = 'other';

/** A run of workflows that share a name prefix, for the picker and the resolved list. */
export interface WorkflowGroup {
  /** Stable within a catalogue — the shared leading segment, or {@link OTHER_WORKFLOWS_KEY}. */
  key: string;
  /** The prefix the members share (`cert-manager`, `mc`), or *Other workflows*. */
  label: string;
  workflows: ToolSummary[];
}

function nameSegments(name: string): string[] {
  return name.split(/[-_]/).filter(segment => segment !== '');
}

/** The leading segments every name shares, in order. */
function commonLeadingSegments(names: string[][]): string[] {
  if (names.length === 0) {
    return [];
  }
  const shortest = Math.min(...names.map(segments => segments.length));
  const common: string[] = [];
  for (let index = 0; index < shortest; index += 1) {
    const segment = names[0][index];
    if (names.every(segments => segments[index] === segment)) {
      common.push(segment);
    } else {
      break;
    }
  }
  return common;
}

function compareByName(a: ToolSummary, b: ToolSummary): number {
  return a.name.localeCompare(b.name);
}

/**
 * Groups workflows by the leading segment of their name — the one structure a
 * workflow catalogue reliably carries. muster's `filter_tools` reports a
 * workflow's `kind`, `labels` (its CR labels, which on a GitOps-managed catalogue
 * are Helm ownership plus whatever the chart adds) and the derived
 * `readOnlyHint`; neither it nor `core_workflow_list` exposes a workflow's steps,
 * and reading each workflow's definition to learn its servers would be one call
 * per workflow. The name prefix needs no extra call and, where authors name
 * workflows `<component>-<what>` (`cert-manager-down`, `mc-etcd-…`), it *is* the
 * component grouping.
 *
 * A group's label is the longest prefix its members share (`cert-manager`, not
 * `cert`); workflows whose leading segment nothing else shares are gathered under
 * *Other workflows*, last. `undefined` when there are too few workflows to group.
 */
export function groupWorkflows(
  workflows: ToolSummary[],
): WorkflowGroup[] | undefined {
  if (workflows.length <= WORKFLOW_GROUPING_MIN) {
    return undefined;
  }
  const byLeadingSegment = new Map<string, ToolSummary[]>();
  for (const workflow of workflows) {
    const name = workflowNameOf(workflow.name);
    const leading = nameSegments(name)[0] ?? name;
    const members = byLeadingSegment.get(leading);
    if (members) {
      members.push(workflow);
    } else {
      byLeadingSegment.set(leading, [workflow]);
    }
  }
  const groups: WorkflowGroup[] = [];
  const singles: ToolSummary[] = [];
  for (const [leading, members] of byLeadingSegment) {
    if (members.length < 2) {
      singles.push(...members);
      continue;
    }
    const common = commonLeadingSegments(
      members.map(member => nameSegments(workflowNameOf(member.name))),
    );
    groups.push({
      key: leading,
      label: common.length > 0 ? common.join('-') : leading,
      workflows: [...members].sort(compareByName),
    });
  }
  groups.sort((a, b) => a.label.localeCompare(b.label));
  if (singles.length > 0) {
    groups.push({
      key: OTHER_WORKFLOWS_KEY,
      label: 'Other workflows',
      workflows: singles.sort(compareByName),
    });
  }
  return groups;
}

/** What a catalogue holds, for the one-line inventory before it is opened. */
export interface CatalogueInventory {
  servers: number;
  /** Tools of aggregated servers — not core tools, not workflows. */
  tools: number;
  platformAdministration: number;
  workflows: number;
}

export function catalogueInventory(
  groups: CatalogueGroup[],
): CatalogueInventory {
  const inventory: CatalogueInventory = {
    servers: 0,
    tools: 0,
    platformAdministration: 0,
    workflows: 0,
  };
  for (const group of groups) {
    inventory.servers += group.servers.length;
    for (const bucket of group.servers) {
      inventory.tools += bucket.tools.length;
    }
    inventory.platformAdministration += group.platformAdministration.length;
    inventory.workflows += group.workflows.length;
  }
  return inventory;
}

/** `1 tool` / `3 tools`. */
export function countNoun(
  count: number,
  noun: string,
  plural = `${noun}s`,
): string {
  return `${count} ${count === 1 ? noun : plural}`;
}
