import { useCallback, useMemo, useState } from 'react';

import type {
  GovernanceMode,
  MCPServerApproval,
  ToolApproval,
  ToolSummary,
} from '../../apis';
import { isReadOnly } from '../../lib/toolAnnotations';
import {
  approvalKeyOf,
  defaultPresetFor,
  draftFromStored,
  expandPreset,
  isWrittenOut,
  matchingPreset,
  presetOfRule,
  storedRule,
  sameDraft,
  type ApprovalDraft,
  type ApprovalPreset,
  type ApprovalRule,
  type ApprovalSetting,
  type ApprovalTool,
} from '../../lib/toolApproval';

/** One tool as the approval step lists it. */
export type ApprovalRow = ApprovalTool & {
  /** The name muster exposes it as, or the key for a tool it does not list. */
  name: string;
  summary?: string;
  /** muster lists it now; a blocked tool, or one gone upstream, is not. */
  listed: boolean;
  /** A reviewed connector has no own entry for it: it follows the rule. */
  isNew: boolean;
  /** What muster reports for it now, for the read-only view. */
  reported?: ToolApproval;
};

export type ToolApprovalDraft = {
  rows: ApprovalRow[];
  /**
   * The connector's settings hold tools' own entries: an admin saved them.
   * Settings with a rule alone (a create's preset) are not reviewed.
   */
  reviewed: boolean;
  draft: ApprovalDraft;
  /** The preset whose fill the draft equals, if any. */
  preset: ApprovalPreset | undefined;
  /**
   * What a row's *Changed* compares with and its reset returns to: the
   * saved setting on a reviewed connector, else the preset's fill.
   */
  reference: (key: string) => ApprovalSetting | undefined;
  /** A save would change what muster stores (always, for a first review). */
  dirty: boolean;
  /**
   * Fills the pills with the preset: every tool and the rule, or, given
   * `keys`, only those tools, leaving every other tool and the rule as
   * they are (a list narrowed by a search or filter).
   */
  applyPreset: (preset: ApprovalPreset, keys?: readonly string[]) => void;
  setRule: (rule: ApprovalRule) => void;
  setTool: (key: string, setting: ApprovalSetting) => void;
  resetTool: (key: string) => void;
};

/**
 * The connector wizard's approval draft. A preset is a shortcut: picking one
 * fills every tool's pill and the rule, and what is saved is the explicit
 * setting of each tool. A connector without settings opens on the preset the
 * governance mode pre-selects; one whose settings hold only a rule (muster
 * stores a create's preset that way, before the connector lists tools) on
 * that preset expanded against the tools listed now, not reviewed, so *Done*
 * writes every tool's setting; a reviewed one on its saved settings, a tool
 * without its own entry (*New*) pre-filled with the rule it follows. Tools
 * that arrive while the connector connects join the draft as they come.
 */
export function useToolApprovalDraft({
  tools,
  prefix,
  stored,
  mode,
}: {
  tools: readonly ToolSummary[];
  /** The connector's tool name prefix (`x_<segment>`). */
  prefix: string;
  stored: MCPServerApproval | undefined;
  /** Unknown pre-selects *Recommended*, never *Allow all*. */
  mode: GovernanceMode | undefined;
}): ToolApprovalDraft {
  const reviewed = isWrittenOut(stored);
  const rows = useMemo<ApprovalRow[]>(() => {
    const listed = tools.map(tool => {
      const key = approvalKeyOf(tool.name, prefix);
      return {
        key,
        name: tool.name,
        summary: tool.summary ?? tool.description,
        readOnly: isReadOnly(tool),
        listed: true,
        isNew: reviewed && stored?.tools?.[key] === undefined,
        reported: tool.approval,
      };
    });
    const keys = new Set(listed.map(row => row.key));
    // Entries for tools muster does not list: a blocked tool is hidden from
    // every listing, and one the server dropped keeps its entry.
    const unlisted = Object.keys(stored?.tools ?? {})
      .filter(key => !keys.has(key))
      .sort()
      .map(key => ({
        key,
        name: key,
        readOnly: false,
        listed: false,
        isNew: false,
      }));
    return [...listed, ...unlisted];
  }, [tools, prefix, stored, reviewed]);

  const saved = useMemo(
    () => (reviewed ? draftFromStored(stored, rows) : undefined),
    [reviewed, stored, rows],
  );
  // Unset until the person picks one: the mode's pre-selection then, which
  // follows the mode once muster reports it.
  const [picked, setPicked] = useState<ApprovalPreset>();
  const [ruleEdit, setRuleEdit] = useState<ApprovalRule>();
  const [edits, setEdits] = useState<Record<string, ApprovalSetting>>({});

  const base = useMemo<ApprovalDraft>(() => {
    if (picked) {
      return expandPreset(picked, rows);
    }
    if (saved) {
      return saved;
    }
    const expanded = expandPreset(
      stored ? presetOfRule(stored) : defaultPresetFor(mode),
      rows,
    );
    // A stored Block rule is kept, and every listed tool keeps what it does
    // now under it, Block: Done writes nothing looser than what is stored.
    if (stored && storedRule(stored.rule) === 'Block') {
      return {
        rule: 'Block',
        tools: Object.fromEntries(rows.map(row => [row.key, 'Block'])),
      };
    }
    return expanded;
  }, [picked, saved, stored, rows, mode]);
  const draft = useMemo<ApprovalDraft>(
    () => ({
      rule: ruleEdit ?? base.rule,
      tools: { ...base.tools, ...edits },
    }),
    [base, ruleEdit, edits],
  );
  const referenceDraft = saved ?? base;

  const applyPreset = useCallback(
    (preset: ApprovalPreset, keys?: readonly string[]) => {
      if (keys) {
        // Only these tools: the rest, and the rule, keep what they hold.
        const chosen = new Set(keys);
        const { tools: filled } = expandPreset(
          preset,
          rows.filter(row => chosen.has(row.key)),
        );
        setEdits(previous => ({ ...previous, ...filled }));
        return;
      }
      setPicked(preset);
      setRuleEdit(undefined);
      setEdits({});
    },
    [rows],
  );
  const setTool = useCallback(
    (key: string, setting: ApprovalSetting) =>
      setEdits(previous => ({ ...previous, [key]: setting })),
    [],
  );
  const resetTool = useCallback(
    (key: string) => {
      const value = referenceDraft.tools[key];
      setEdits(previous => {
        const next = { ...previous };
        if (value === undefined || base.tools[key] === value) {
          delete next[key];
        } else {
          next[key] = value;
        }
        return next;
      });
    },
    [referenceDraft, base],
  );

  return {
    rows,
    reviewed,
    draft,
    preset: matchingPreset(draft, rows),
    reference: key => referenceDraft.tools[key],
    dirty: !saved || !sameDraft(draft, saved),
    applyPreset,
    setRule: setRuleEdit,
    setTool,
    resetTool,
  };
}
