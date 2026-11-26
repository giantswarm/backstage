/**
 * An agent's tool approval (giantswarm/giantswarm#38902, milestone 2): the
 * settings on its tool list's entries (`Allow`, `Ask`, `Block`) and the
 * list's default, as the portal edits and shows them. muster decides and
 * enforces; agent-manager stores the list and the exceptions (grants). The
 * portal composes the list, reads what muster reports for it
 * (`filter_tools` with `agentTools`) and splits a save over the tools
 * agent-manager takes each part with.
 */

// eslint-disable-next-line @backstage/no-mixed-plugin-imports -- Approvals are what muster reports for an agent's tool list.
import {
  BUILT_IN_HINT,
  reportedSetting,
  type AgentToolsArgument,
  type ToolApproval,
  type ToolSummary,
} from '@giantswarm/backstage-plugin-muster';

import type {
  AgentApprovalChange,
  AgentApprovalGrant,
  AgentApprovalSetting,
  AgentManagerAgent,
  AgentToolEntry,
} from './agentManager';
import { SELECTOR_PATTERN, parseSelector, selectorForTool } from './toolset';

export const AGENT_APPROVAL_SETTINGS: readonly AgentApprovalSetting[] = [
  'Allow',
  'Ask',
  'Block',
];

/** The settings being edited: per entry (by selector), and the default. */
export type AgentApprovalDraft = {
  settings: Readonly<Record<string, AgentApprovalSetting>>;
  default?: AgentApprovalSetting;
};

export const NO_APPROVAL: AgentApprovalDraft = { settings: {} };

/** On a trusted platform, beside the agent's approval settings (PRD copy). */
export const TRUSTED_AGENT_NOTE =
  'Agents can create and start agents without asking.';

export function isApprovalSetting(
  value: unknown,
): value is AgentApprovalSetting {
  return (AGENT_APPROVAL_SETTINGS as readonly unknown[]).includes(value);
}

/** An entry's selector. */
export function entrySelector(entry: AgentToolEntry): string {
  return typeof entry === 'string' ? entry : Object.keys(entry)[0];
}

/** An entry's setting, if it carries one. */
export function entrySetting(
  entry: AgentToolEntry,
): AgentApprovalSetting | undefined {
  return typeof entry === 'string' ? undefined : Object.values(entry)[0];
}

function isToolEntry(item: unknown): item is AgentToolEntry {
  if (typeof item === 'string') {
    return SELECTOR_PATTERN.test(item);
  }
  if (typeof item !== 'object' || item === null || Array.isArray(item)) {
    return false;
  }
  const keys = Object.keys(item);
  return (
    keys.length === 1 &&
    SELECTOR_PATTERN.test(keys[0]) &&
    isApprovalSetting((item as Record<string, unknown>)[keys[0]])
  );
}

/**
 * The field of `get_agent` / `list_agents` that carries the agent's tool list
 * with its settings (decision #86: `tools` stays the kagent bindings). One
 * name here, so a rename in the contract is a one-line change.
 */
export const TOOL_LIST_FIELD = 'toolSettings' as const;

/**
 * The agent's tool list from `get_agent`, or undefined: absent from an
 * agent-manager before tool approval, and anything that is not a tool list
 * reads as none.
 */
export function agentToolListOf(
  agent: Pick<AgentManagerAgent, typeof TOOL_LIST_FIELD> | undefined,
): AgentToolEntry[] | undefined {
  const raw = agent?.[TOOL_LIST_FIELD];
  if (!Array.isArray(raw) || raw.length === 0 || !raw.every(isToolEntry)) {
    return undefined;
  }
  return raw;
}

/**
 * Whether agent-manager says the agent's settings are not enforced (its
 * session binding is off): saved, but muster applies only the connectors'
 * settings to the agent's calls.
 */
export function approvalNotEnforced(
  agent: Pick<AgentManagerAgent, 'approvalEnforced'> | undefined,
): boolean {
  return agent?.approvalEnforced === false;
}

/** Said where an agent's settings are shown or edited but not enforced. */
export const APPROVAL_NOT_ENFORCED_NOTE =
  "This platform's agent-manager does not bind agents' settings to their sessions, so they are saved but not enforced: the connectors' settings apply.";

/** The stored settings of an agent, as the editor starts from them. */
export function approvalDraftOf(
  agent:
    | Pick<AgentManagerAgent, typeof TOOL_LIST_FIELD | 'defaultApproval'>
    | undefined,
): AgentApprovalDraft {
  const settings: Record<string, AgentApprovalSetting> = {};
  for (const entry of agentToolListOf(agent) ?? []) {
    const setting = entrySetting(entry);
    if (setting) {
      settings[entrySelector(entry)] = setting;
    }
  }
  const fallback = agent?.defaultApproval;
  return isApprovalSetting(fallback)
    ? { settings, default: fallback }
    : { settings };
}

/**
 * The settings on tools the selection does not name one by one (`tool:x`
 * set on a tool its connector's entry selects): written as their own entry,
 * which selects nothing new while the tool is covered.
 */
export function extraSettingSelectors(
  selection: readonly string[],
  draft: AgentApprovalDraft,
): string[] {
  return Object.keys(draft.settings).filter(
    selector => !selection.includes(selector) && isOwnToolSelector(selector),
  );
}

function isOwnToolSelector(selector: string): boolean {
  const kind = parseSelector(selector)?.kind;
  return kind === 'tool' || kind === 'workflow';
}

/**
 * The tool list a save writes: the selection's selectors with their
 * settings, then the settings on single tools the selection covers without
 * naming them (`covered`: the selectors of the tools it resolves to). A
 * setting on a tool no longer covered is not written: it would make the
 * tool visible. Settings of selectors no longer selected are dropped.
 */
export function composeToolList(
  selection: readonly string[],
  draft: AgentApprovalDraft,
  covered?: ReadonlySet<string>,
): AgentToolEntry[] {
  const entries: AgentToolEntry[] = selection.map(selector => {
    const setting = draft.settings[selector];
    return setting ? { [selector]: setting } : selector;
  });
  for (const selector of extraSettingSelectors(selection, draft)) {
    if (covered?.has(selector)) {
      entries.push({ [selector]: draft.settings[selector] });
    }
  }
  return entries;
}

/**
 * The selectors a resolution's tools are picked by (`tool:x`,
 * `workflow:y`): what {@link composeToolList} checks coverage against.
 */
export function coveredSelectorsOf(
  tools: readonly Pick<ToolSummary, 'name' | 'kind'>[],
): Set<string> {
  return new Set(tools.map(selectorForTool));
}

/** The reporting argument for muster (`filter_tools` `agentTools`). */
export function agentToolsArgumentOf(
  tools: readonly AgentToolEntry[],
  fallback?: AgentApprovalSetting,
  grants?: readonly AgentApprovalGrant[],
): AgentToolsArgument | undefined {
  if (tools.length === 0) {
    return undefined;
  }
  return {
    tools: [...tools],
    ...(fallback && { default: fallback }),
    ...(grants &&
      grants.length > 0 && {
        grants: grants.map(grant => ({
          entry: grant.entry,
          server: grant.server,
          ...(grant.connectorUid && { uid: grant.connectorUid }),
          // muster lifts only the tools a grant names (#86).
          ...(grant.tools && { tools: [...grant.tools] }),
        })),
      }),
  };
}

/** The connector's own setting for a tool, before the agent's. */
export function adminApprovalOf(
  approval: ToolApproval | undefined,
): Pick<ToolApproval, 'setting' | 'source'> | undefined {
  if (!approval) {
    return undefined;
  }
  if (approval.admin) {
    return approval.admin;
  }
  return approval.source === 'agent' || approval.source === 'agent-exception'
    ? undefined
    : { setting: approval.setting, source: approval.source };
}

/** A connector's own `Ask`, which a connector admin's grant may lift. */
function asksByConnector(approval: ToolApproval | undefined): boolean {
  const admin = adminApprovalOf(approval);
  return (
    admin?.setting === 'ask' &&
    (admin.source === 'tool' || admin.source === 'connector')
  );
}

/**
 * Whether an `Allow` on `selector` lifts a connector's `Ask` (it needs a
 * grant, so only `set_agent_approval` takes it): a tool it decides asks by
 * its connector. Without muster's report, assumed so.
 */
export function allowNeedsGrant(
  selector: string,
  report: readonly ToolSummary[] | undefined,
): boolean {
  if (!report) {
    return true;
  }
  return report.some(
    tool => tool.approval?.entry === selector && asksByConnector(tool.approval),
  );
}

/**
 * A new agent's settings over its two writes: `create_agent` takes every
 * setting but an `Allow` over a connector's `Ask` and an allowing default;
 * `set_agent_approval` then sets those (`followUp`).
 */
export function createApprovalSplit(
  tools: readonly AgentToolEntry[],
  fallback: AgentApprovalSetting | undefined,
  report: readonly ToolSummary[] | undefined,
): {
  tools: AgentToolEntry[];
  default?: AgentApprovalSetting;
  followUp?: AgentApprovalChange;
} {
  const settings: Record<string, AgentApprovalSetting> = {};
  const created = tools.map(entry => {
    const selector = entrySelector(entry);
    if (entrySetting(entry) === 'Allow' && allowNeedsGrant(selector, report)) {
      settings[selector] = 'Allow';
      return selector;
    }
    return entry;
  });
  const followUp: AgentApprovalChange = {
    ...(Object.keys(settings).length > 0 && { settings }),
    ...(fallback === 'Allow' && { default: 'Allow' as const }),
  };
  return {
    tools: created,
    ...(fallback && fallback !== 'Allow' && { default: fallback }),
    ...(Object.keys(followUp).length > 0 && { followUp }),
  };
}

function settingsOf(
  tools: readonly AgentToolEntry[],
): Map<string, AgentApprovalSetting | undefined> {
  return new Map(
    tools.map(entry => [entrySelector(entry), entrySetting(entry)]),
  );
}

/**
 * An edit's settings over agent-manager's tools: `tools` for
 * `update_agent_access` when the list's entries changed (an `Allow` over a
 * connector's `Ask` that is new there carried as the entry stood before),
 * then `approval` for `set_agent_approval`: every setting the list does not
 * carry yet, and the default when it changed.
 */
export function editApprovalPlan(
  stored: { tools: readonly AgentToolEntry[]; default?: AgentApprovalSetting },
  draft: { tools: readonly AgentToolEntry[]; default?: AgentApprovalSetting },
  report: readonly ToolSummary[] | undefined,
): { tools?: AgentToolEntry[]; approval?: AgentApprovalChange } {
  const before = settingsOf(stored.tools);
  const selectorsChanged =
    stored.tools.length !== draft.tools.length ||
    draft.tools.some(
      (entry, index) =>
        entrySelector(entry) !== entrySelector(stored.tools[index]),
    );
  let written = before;
  let tools: AgentToolEntry[] | undefined;
  if (selectorsChanged) {
    tools = draft.tools.map(entry => {
      const selector = entrySelector(entry);
      const was = before.get(selector);
      if (
        entrySetting(entry) === 'Allow' &&
        was !== 'Allow' &&
        allowNeedsGrant(selector, report)
      ) {
        return was ? { [selector]: was } : selector;
      }
      return entry;
    });
    written = settingsOf(tools);
  }
  const settings: Record<string, AgentApprovalSetting | ''> = {};
  for (const entry of draft.tools) {
    const selector = entrySelector(entry);
    const wanted = entrySetting(entry);
    if (wanted !== written.get(selector)) {
      settings[selector] = wanted ?? '';
    }
  }
  const approval: AgentApprovalChange = {
    ...(Object.keys(settings).length > 0 && { settings }),
    ...((draft.default ?? '') !== (stored.default ?? '') && {
      default: draft.default ?? '',
    }),
  };
  return {
    ...(tools && { tools }),
    ...(Object.keys(approval).length > 0 && { approval }),
  };
}

/** The grants a save removes, by why. */
export type DroppedExceptions = {
  /** The person saving is no connector admin of their connector. */
  notAdmin: AgentApprovalGrant[];
  /** Their entry no longer allows: the person changed it. */
  changed: AgentApprovalGrant[];
  /** The save goes to git, which carries no grant. */
  viaGit: AgentApprovalGrant[];
  /** Whether the person is admin of their connector could not be checked. */
  unchecked: AgentApprovalGrant[];
};

/**
 * What saving does to the agent's exceptions (agent-manager: any save keeps
 * a grant only while its entry still allows and the saver is connector
 * admin of its connector; a save to git keeps none).
 */
export function droppedExceptions(
  grants: readonly AgentApprovalGrant[],
  draft: { tools: readonly AgentToolEntry[]; default?: AgentApprovalSetting },
  isAdminOf: (server: string) => boolean | undefined,
  viaGit = false,
): DroppedExceptions {
  const settings = settingsOf(draft.tools);
  const dropped: DroppedExceptions = {
    notAdmin: [],
    changed: [],
    viaGit: [],
    unchecked: [],
  };
  for (const grant of grants) {
    const allows =
      grant.entry === 'default'
        ? draft.default === 'Allow'
        : settings.get(grant.entry) === 'Allow';
    if (!allows) {
      dropped.changed.push(grant);
    } else if (viaGit) {
      dropped.viaGit.push(grant);
    } else {
      const admin = isAdminOf(grant.server);
      if (admin === false) {
        dropped.notAdmin.push(grant);
      } else if (admin === undefined) {
        dropped.unchecked.push(grant);
      }
    }
  }
  return dropped;
}

/** An entry in a sentence: a tool or workflow by name, a connector's whole list, the default. */
export function entryLabel(
  entry: string,
  labelOf: (server: string) => string = server => server,
): string {
  if (entry === 'default') {
    return 'the default';
  }
  const selector = parseSelector(entry);
  switch (selector?.kind) {
    case 'server':
      return `every ${labelOf(selector.name)} tool`;
    case 'preset':
      return `preset ${selector.name}`;
    default:
      return selector?.name ?? entry;
  }
}

function joinOr(items: readonly string[]): string {
  if (items.length <= 1) {
    return items.join('');
  }
  return `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`;
}

/**
 * The note before a save that drops exceptions the person is no connector
 * admin of: "Saving removes 1 exception (merge PRs). A GitHub admin can
 * grant it again." Undefined when there are none.
 */
export function exceptionsNote(
  grants: readonly AgentApprovalGrant[],
  labelOf: (server: string) => string = server => server,
): string | undefined {
  if (grants.length === 0) {
    return undefined;
  }
  const one = grants.length === 1;
  const entries = [
    ...new Set(grants.map(grant => entryLabel(grant.entry, labelOf))),
  ];
  const connectors = [...new Set(grants.map(grant => labelOf(grant.server)))];
  return `Saving removes ${grants.length} exception${one ? '' : 's'} (${entries.join(
    ', ',
  )}). A ${joinOr(connectors)} admin can grant ${one ? 'it' : 'them'} again.`;
}

/**
 * Why a tool's *Allow* pill cannot be picked, or undefined when it can. An
 * `Allow` never lifts a built-in or a governance `Ask` (decision #79), and
 * over a connector's `Ask` it is an exception only that connector's admins
 * grant, live (a release in git carries none).
 */
export function allowBlocker(
  tool: Pick<ToolSummary, 'approval' | 'connectorAdmin'>,
  options: { connectorLabel: string; viaGit?: boolean },
): string | undefined {
  switch (tool.approval?.source) {
    case 'builtin':
      return BUILT_IN_HINT;
    case 'governance':
      return "This platform's governance mode asks first when an agent calls it. No setting here changes that.";
    case 'unavailable':
      return "Its connector's settings can't be read.";
    default:
      break;
  }
  if (!asksByConnector(tool.approval)) {
    return undefined;
  }
  if (tool.connectorAdmin !== true) {
    return `Only ${options.connectorLabel} admins can allow this.`;
  }
  return options.viaGit
    ? "An agent applied from Git can't skip a connector's Ask: its pull request carries no exceptions."
    : undefined;
}

/**
 * Why *Allow* on a whole connector (or the default) cannot be picked: the
 * first of its tools whose connector asks and whose admin the person is not.
 * Tools that ask by the platform (built in, governance) do not block it:
 * the `Allow` leaves them asking, which {@link platformAskCount} says.
 */
export function allowBlockerOfMany(
  tools: readonly Pick<ToolSummary, 'approval' | 'connectorAdmin' | 'server'>[],
  options: { labelOf: (server: string) => string; viaGit?: boolean },
): string | undefined {
  for (const tool of tools) {
    if (
      tool.approval?.source === 'builtin' ||
      tool.approval?.source === 'governance' ||
      tool.approval?.source === 'unavailable'
    ) {
      continue;
    }
    const blocker = allowBlocker(tool, {
      connectorLabel: options.labelOf(tool.server ?? ''),
      viaGit: options.viaGit,
    });
    if (blocker) {
      return blocker;
    }
  }
  return undefined;
}

/** How many of the tools ask whatever the agent's settings say. */
export function platformAskCount(
  tools: readonly Pick<ToolSummary, 'approval'>[],
): number {
  return tools.filter(
    tool =>
      tool.approval?.source === 'builtin' ||
      tool.approval?.source === 'governance',
  ).length;
}

/**
 * The setting a tool's pills show: its own entry's in the draft, else what
 * muster reports for the agent.
 */
export function shownSetting(
  tool: Pick<ToolSummary, 'name' | 'kind' | 'approval'>,
  draft: AgentApprovalDraft,
): AgentApprovalSetting | undefined {
  const own = draft.settings[selectorForTool(tool)];
  if (own) {
    return own;
  }
  return tool.approval ? reportedSetting(tool.approval) : undefined;
}

/** How many tools of a report run, ask and are hidden, for a summary line. */
export function approvalCounts(
  tools: readonly Pick<ToolSummary, 'approval'>[],
): Record<AgentApprovalSetting, number> {
  const counts: Record<AgentApprovalSetting, number> = {
    Allow: 0,
    Ask: 0,
    Block: 0,
  };
  for (const tool of tools) {
    if (tool.approval) {
      counts[reportedSetting(tool.approval)] += 1;
    }
  }
  return counts;
}

/** "3 run, 2 ask first, 1 blocked": what an agent's tools do, in one line. */
export function approvalSummary(
  counts: Record<AgentApprovalSetting, number>,
): string {
  const parts = [
    counts.Allow > 0 && `${counts.Allow} run without asking`,
    counts.Ask > 0 && `${counts.Ask} ask first`,
    counts.Block > 0 && `${counts.Block} blocked`,
  ].filter((part): part is string => Boolean(part));
  return parts.length === 0 ? 'No tools' : parts.join(', ');
}

/**
 * Whether the person is connector admin of a server, as muster's report
 * says it on the tools behind it (matched through `connectors[]`, so a
 * family's member counts): undefined when no reported tool is on it.
 */
export function connectorAdminFrom(
  report:
    | readonly Pick<ToolSummary, 'server' | 'connectors' | 'connectorAdmin'>[]
    | undefined,
): (server: string) => boolean | undefined {
  return server =>
    report?.find(
      tool =>
        tool.connectorAdmin !== undefined &&
        ((tool.connectors ?? []).some(ref => ref.server === server) ||
          (!tool.connectors && tool.server === server)),
    )?.connectorAdmin;
}

/**
 * What of an agent its approval save is composed from — its tool list, the
 * default, the grants and the release generation — as one comparable key:
 * a save stops when it changed since the form read it.
 */
export function approvalStateKey(
  agent: Pick<
    AgentManagerAgent,
    typeof TOOL_LIST_FIELD | 'defaultApproval' | 'grants' | 'generation'
  >,
): string {
  const grants = (agent.grants ?? [])
    .map(grant =>
      [
        grant.entry,
        grant.server,
        [...(grant.tools ?? [])].sort().join(','),
      ].join('|'),
    )
    .sort();
  return JSON.stringify({
    tools: agentToolListOf(agent) ?? null,
    default: agent.defaultApproval ?? null,
    grants,
    generation: agent.generation ?? null,
  });
}

/** Whether an agent carries approval settings or exceptions a save must keep. */
export function carriesApprovalSettings(
  agent: Pick<
    AgentManagerAgent,
    typeof TOOL_LIST_FIELD | 'defaultApproval' | 'grants' | 'approvalSettings'
  >,
): boolean {
  return (
    agent.approvalSettings === true ||
    Boolean(agentToolListOf(agent)?.some(entry => typeof entry !== 'string')) ||
    isApprovalSetting(agent.defaultApproval) ||
    (agent.grants?.length ?? 0) > 0
  );
}

/**
 * The one-line summary of a report as a page says it: marked when muster
 * listed only part of the tools, and when the settings are saved but not
 * enforced (#86).
 */
export function reportSummary(
  report: {
    tools: readonly Pick<ToolSummary, 'approval'>[];
    truncated: boolean;
  },
  notEnforced = false,
): string {
  let line = approvalSummary(approvalCounts(report.tools));
  if (report.truncated) {
    line += ' (of the first tools listed only)';
  }
  if (notEnforced) {
    line += ' — saved, not enforced';
  }
  return line;
}
