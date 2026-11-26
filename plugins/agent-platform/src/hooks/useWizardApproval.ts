import { useMemo } from 'react';
// eslint-disable-next-line @backstage/no-mixed-plugin-imports -- Approvals are what muster reports for an agent's tool list.
import type { AgentToolsArgument } from '@giantswarm/backstage-plugin-muster';

import {
  agentToolsArgumentOf,
  composeToolList,
  coveredSelectorsOf,
  extraSettingSelectors,
  NO_APPROVAL,
  type AgentApprovalDraft,
} from '../lib/agentApproval';
import type {
  AgentApprovalGrant,
  AgentApprovalSetting,
  AgentToolEntry,
} from '../lib/agentManager';
import { declaredToolset, toolsetShape } from '../lib/toolset';
import {
  useAgentApprovalReport,
  type AgentApprovalReport,
} from './useAgentApprovalReport';
import {
  useAgentApprovalSupport,
  type AgentApprovalSupport,
} from './useAgentApprovalSupport';
import type { ToolsetResolution } from './useToolsetResolution';

export type WizardApproval = {
  support: AgentApprovalSupport;
  /** agent-manager takes approval settings: the wizard offers and saves them. */
  supported: boolean;
  draft: AgentApprovalDraft;
  /** The tool list a save writes, with its settings. */
  tools: AgentToolEntry[];
  default?: AgentApprovalSetting;
  /** muster's report of that list for the agent. */
  report: AgentApprovalReport;
  /**
   * Settings on single tools wait for the resolution that says whether the
   * selection still covers them: a save waits too, as one without them
   * could loosen and one with them could widen.
   */
  coveragePending: boolean;
};

/**
 * The wizard's approval settings as a save writes them and as muster
 * reports them, for the Tools step and the review: the selection's
 * selectors with their settings, the settings on single tools it covers,
 * the default, and the agent's grants (an edit), reported for the agent.
 */
export function useWizardApproval(
  installation: string | undefined,
  selection: string[],
  draft: AgentApprovalDraft | undefined,
  resolution: ToolsetResolution,
  grants?: readonly AgentApprovalGrant[],
): WizardApproval {
  const support = useAgentApprovalSupport(installation);
  const supported = support === 'supported';
  const settings = draft ?? NO_APPROVAL;
  const declared = useMemo(() => declaredToolset(selection), [selection]);
  const covered = useMemo(
    () =>
      resolution.status === 'resolved'
        ? coveredSelectorsOf(resolution.tools)
        : undefined,
    [resolution.status, resolution.tools],
  );
  const tools = useMemo(
    () => composeToolList(declared, settings, covered),
    [declared, settings, covered],
  );
  const agentTools: AgentToolsArgument | undefined = useMemo(
    () =>
      supported && toolsetShape(declared) !== 'none'
        ? agentToolsArgumentOf(tools, settings.default, grants)
        : undefined,
    [supported, declared, tools, settings.default, grants],
  );
  const report = useAgentApprovalReport(installation, agentTools);
  return {
    support,
    supported,
    draft: settings,
    tools,
    default: settings.default,
    report,
    coveragePending:
      supported &&
      extraSettingSelectors(declared, settings).length > 0 &&
      !covered,
  };
}
