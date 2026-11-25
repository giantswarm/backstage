import type {
  GovernanceMode,
  MCPServerApproval,
  ToolApproval,
  ToolApprovalSource,
} from '../apis/types';

/**
 * A connector's tool approval, as the portal shows and edits it. muster
 * decides and enforces; the portal renders what muster reports and writes
 * explicit settings. The words are the same on every surface (PRD "Labels
 * and tooltips").
 */

/** A tool's setting: it runs, it asks a person first, or it is hidden. */
export type ApprovalSetting = 'Allow' | 'Ask' | 'Block';

/**
 * What a tool without its own entry gets, new tools included: it runs, it
 * asks first, or it is hidden and refused until someone sets it.
 */
export type ApprovalRule = 'Allow' | 'Ask' | 'Block';

/** The settings in the order the pills show them. */
export const APPROVAL_SETTINGS: readonly ApprovalSetting[] = [
  'Allow',
  'Ask',
  'Block',
];

/**
 * The rule's choices, where muster takes them all
 * ({@link ruleOptionsOf}): *Block* hides tools added later until someone
 * sets them.
 */
export const APPROVAL_RULES: readonly ApprovalRule[] = [
  'Allow',
  'Ask',
  'Block',
];

/** Each setting in one short sentence, wherever its pill or badge shows. */
export const APPROVAL_SETTING_HINTS: Record<ApprovalSetting, string> = {
  Allow: 'Runs without asking.',
  Ask: 'Asks first.',
  Block: "Hidden. Can't be used.",
};

/** Under the connector's rule. */
export const APPROVAL_RULE_HINT = 'New tools follow this rule.';

/** Under the connector's rule when it is *Block*. */
export const APPROVAL_RULE_BLOCK_HINT =
  "New tools follow this rule: they are hidden and can't be used until someone sets them.";

/**
 * The rule's choices `core_mcpserver_set_approval` takes, from its input
 * schema: the `approval.rule` enum it declares, else all of them. A muster
 * whose rule takes only Allow and Ask does not offer *Block*.
 */
export function ruleOptionsOf(
  inputSchema: { properties?: Record<string, unknown> } | undefined,
): readonly ApprovalRule[] {
  const approval = inputSchema?.properties?.approval as
    { properties?: { rule?: { enum?: unknown } } } | undefined;
  const declared = approval?.properties?.rule?.enum;
  if (!Array.isArray(declared)) {
    return APPROVAL_RULES;
  }
  return APPROVAL_RULES.filter(rule => declared.includes(rule));
}

/** A built-in setting nobody changes (muster's own configuration tools). */
export const BUILT_IN_HINT = 'Built in. Always asks.';

/**
 * The creation presets: shortcuts that fill every tool's setting, never a
 * value stored or read at runtime.
 */
export type ApprovalPreset = 'recommended' | 'allow-all' | 'ask-all';

export const APPROVAL_PRESETS: readonly ApprovalPreset[] = [
  'recommended',
  'allow-all',
  'ask-all',
];

export const APPROVAL_PRESET_LABELS: Record<ApprovalPreset, string> = {
  recommended: 'Recommended',
  'allow-all': 'Allow all',
  'ask-all': 'Ask all',
};

export const APPROVAL_PRESET_HINTS: Record<ApprovalPreset, string> = {
  recommended: 'Read-only tools run. The rest ask.',
  'allow-all': 'Everything runs.',
  'ask-all': 'Everything asks.',
};

/**
 * The preset the wizard pre-selects and a create sends on a connector nobody
 * reviewed: *Allow all* only on a platform known to be trusted (an upgrade
 * changes nothing there), *Recommended* on a governed one and whenever the
 * mode is unknown (fail safe: never *Allow all* on a guess).
 */
export function defaultPresetFor(
  mode: GovernanceMode | undefined,
): ApprovalPreset {
  return mode === 'trusted' ? 'allow-all' : 'recommended';
}

/** Said where the mode decides a pre-selection and could not be read. */
export const GOVERNANCE_MODE_UNKNOWN_NOTE =
  "This platform's governance mode could not be read, so Recommended is pre-selected: read-only tools run, the rest ask. Pick another preset if it should be different.";

/**
 * Whether stored settings hold a tool's own entry: what a connector admin's
 * *Done* writes. A create's preset stores only the preset's rule (muster
 * cannot expand it before the connector lists its tools), so settings with a
 * rule and no entry were never reviewed against real tools.
 */
export function isWrittenOut(approval: MCPServerApproval | undefined): boolean {
  return Object.keys(approval?.tools ?? {}).length > 0;
}

/**
 * The preset a create stored as a rule alone, to expand against the tools
 * listed now: the rule `Ask` is *Recommended* (the stricter preset a create
 * sends), `Allow` (or none) *Allow all*.
 */
export function presetOfRule(approval: MCPServerApproval): ApprovalPreset {
  return storedRule(approval.rule) === 'Allow' ? 'allow-all' : 'recommended';
}

/** A tool as the settings key it: the server's own name, and its effect. */
export type ApprovalTool = {
  /** The server's own tool name (no `x_`, family or tool prefix). */
  key: string;
  /** Annotated `readOnlyHint: true` by its server. */
  readOnly: boolean;
};

/** The settings being edited: always explicit, one entry per tool. */
export type ApprovalDraft = {
  rule: ApprovalRule;
  tools: Record<string, ApprovalSetting>;
};

/**
 * A stored setting, as muster reads it: a value it does not know counts as
 * `Ask` (fail closed). Undefined for no value.
 */
export function storedSetting(
  value: string | undefined,
): ApprovalSetting | undefined {
  if (value === undefined) {
    return undefined;
  }
  return value === 'Allow' || value === 'Block' ? value : 'Ask';
}

/** A stored rule as muster reads it: unset is `Allow`, unknown is `Ask`. */
export function storedRule(value: string | undefined): ApprovalRule {
  if (value === undefined || value === '' || value === 'Allow') {
    return 'Allow';
  }
  return value === 'Block' ? 'Block' : 'Ask';
}

/**
 * A preset written out for the tools listed now, as muster expands it on
 * save: *Recommended* rule `Ask`, each read-only tool `Allow`, every other
 * `Ask`; *Allow all* everything `Allow`; *Ask all* everything `Ask`.
 */
export function expandPreset(
  preset: ApprovalPreset,
  tools: readonly ApprovalTool[],
): ApprovalDraft {
  const rule: ApprovalRule = preset === 'allow-all' ? 'Allow' : 'Ask';
  const settingOf = (tool: ApprovalTool): ApprovalSetting => {
    if (preset === 'recommended') {
      return tool.readOnly ? 'Allow' : 'Ask';
    }
    return rule;
  };
  return {
    rule,
    tools: Object.fromEntries(tools.map(tool => [tool.key, settingOf(tool)])),
  };
}

/**
 * The stored settings as a draft: each tool's own entry, else the rule it
 * follows now (a *New* tool), so saving writes it out. Entries for tools not
 * listed now (a blocked tool is never listed) are kept as they are.
 */
export function draftFromStored(
  approval: MCPServerApproval | undefined,
  tools: readonly ApprovalTool[],
): ApprovalDraft {
  const rule = storedRule(approval?.rule);
  const stored: Record<string, ApprovalSetting> = {};
  for (const [key, value] of Object.entries(approval?.tools ?? {})) {
    stored[key] = storedSetting(value) ?? 'Ask';
  }
  for (const tool of tools) {
    stored[tool.key] ??= rule;
  }
  return { rule, tools: stored };
}

/**
 * Whether two stored settings are the same, as muster compares them: no
 * settings equal empty ones (no rule, no entries).
 */
export function sameStoredApproval(
  a: MCPServerApproval | undefined,
  b: MCPServerApproval | undefined,
): boolean {
  if ((a?.rule || undefined) !== (b?.rule || undefined)) {
    return false;
  }
  const left = a?.tools ?? {};
  const right = b?.tools ?? {};
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...keys].every(key => left[key] === right[key]);
}

/** Whether two drafts store the same settings. */
export function sameDraft(a: ApprovalDraft, b: ApprovalDraft): boolean {
  if (a.rule !== b.rule) {
    return false;
  }
  const keys = new Set([...Object.keys(a.tools), ...Object.keys(b.tools)]);
  return [...keys].every(key => a.tools[key] === b.tools[key]);
}

/**
 * The preset whose expansion the draft equals for the listed tools, if any:
 * the preset pill then shows selected. Entries for unlisted tools do not
 * count, as a preset cannot know them.
 */
export function matchingPreset(
  draft: ApprovalDraft,
  tools: readonly ApprovalTool[],
): ApprovalPreset | undefined {
  return APPROVAL_PRESETS.find(preset => {
    const expanded = expandPreset(preset, tools);
    return (
      expanded.rule === draft.rule &&
      tools.every(tool => draft.tools[tool.key] === expanded.tools[tool.key])
    );
  });
}

/** The draft as `spec.approval`, explicit for every tool it holds. */
export function approvalOf(draft: ApprovalDraft): Required<MCPServerApproval> {
  return { rule: draft.rule, tools: { ...draft.tools } };
}

/** A reported setting (`allow`) as the stored word (`Allow`). */
export function reportedSetting(
  approval: Pick<ToolApproval, 'setting'>,
): ApprovalSetting {
  switch (approval.setting) {
    case 'allow':
      return 'Allow';
    case 'block':
      return 'Block';
    default:
      return 'Ask';
  }
}

/** Where a setting comes from, in words, for the Tools tab. */
export const APPROVAL_SOURCE_LABELS: Record<ToolApprovalSource, string> = {
  tool: 'Set for this tool',
  connector: "Connector's rule",
  unreviewed: 'Not reviewed',
  builtin: BUILT_IN_HINT,
  unavailable: "Settings can't be read",
  agent: "Agent's setting",
  'agent-exception': 'Allowed for this agent',
  governance: 'Governance mode',
};

/** A source muster may add later reads as itself rather than as nothing. */
export function approvalSourceLabel(source: string): string {
  return (APPROVAL_SOURCE_LABELS as Record<string, string>)[source] ?? source;
}

/**
 * Whether muster reports the connector's settings as not reviewed: it lists
 * tools, each `unreviewed` (no settings), or each following the connector's
 * rule as *New* with no entry of its own (a create's preset stored the rule
 * alone, before any tool was listed). Undefined when muster reports no
 * approval at all (an older muster), which says nothing either way.
 * muster's built-in settings do not count.
 */
export function isUnreviewed(
  tools: readonly { approval?: ToolApproval }[],
): boolean | undefined {
  const reported = tools.filter(
    tool => tool.approval && tool.approval.source !== 'builtin',
  );
  if (reported.length === 0) {
    return undefined;
  }
  return (
    reported.every(tool => tool.approval?.source === 'unreviewed') ||
    reported.every(
      tool =>
        tool.approval?.source === 'connector' && tool.approval.new === true,
    )
  );
}

/**
 * What every tool of a connector nobody reviewed does now: `Allow` without
 * settings, the rule a create stored otherwise.
 */
export function unreviewedSetting(
  tools: readonly { approval?: ToolApproval }[],
): ApprovalSetting {
  const reported = tools.find(
    tool => tool.approval && tool.approval.source !== 'builtin',
  )?.approval;
  return reported ? reportedSetting(reported) : 'Allow';
}

/**
 * Whether muster could not read the connector's settings for any of the
 * tools (`source: unavailable`).
 */
export function isSettingsUnreadable(
  tools: readonly { approval?: ToolApproval }[],
): boolean {
  return tools.some(tool => tool.approval?.source === 'unavailable');
}

/**
 * Why muster refuses the calls of the tools that ask, when approvals cannot
 * be answered right now (`approval.unavailable`): a missing prerequisite an
 * admin can fix. Undefined when no tool reports one. A tool that does not ask
 * never carries it.
 */
export function approvalRefusalReason(
  tools: readonly { approval?: ToolApproval }[],
): string | undefined {
  return tools
    .map(tool => tool.approval?.unavailable?.trim())
    .find((reason): reason is string => Boolean(reason));
}

/** The warning for tools that ask where approvals cannot be answered. */
export function approvalRefusalNote(reason: string): {
  title: string;
  description: string;
} {
  return {
    title: "Approvals can't be answered right now",
    description: `Tools that ask first are refused until this is fixed: ${reason.replace(
      /[.\s]+$/,
      '',
    )}. Ask an admin of this platform.`,
  };
}

/**
 * Whether the caller is a connector admin, as muster reports it on the
 * connector's tools: `false` when any tool says not, `true` when one says
 * so, undefined when none says (no tools, an older muster).
 */
export function connectorAdminOf(
  tools: readonly { connectorAdmin?: boolean }[],
): boolean | undefined {
  if (tools.some(tool => tool.connectorAdmin === false)) {
    return false;
  }
  return tools.some(tool => tool.connectorAdmin === true) ? true : undefined;
}

/** The tool's own name: its exposed name without the connector's prefix. */
export function approvalKeyOf(name: string, prefix: string): string {
  return name.startsWith(`${prefix}_`) ? name.slice(prefix.length + 1) : name;
}
