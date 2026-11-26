import { useMemo } from 'react';
// eslint-disable-next-line @backstage/no-mixed-plugin-imports -- Approvals are what muster reports for an agent's tool list.
import type { ToolSummary } from '@giantswarm/backstage-plugin-muster';

import {
  agentToolListOf,
  agentToolsArgumentOf,
  approvalNotEnforced,
  isApprovalSetting,
} from '../lib/agentApproval';
import { useAgentManagerAgent } from './useAgentManagerAgent';
import {
  useAgentApprovalReport,
  type AgentApprovalReport,
} from './useAgentApprovalReport';

export type AgentApproval = {
  /** agent-manager reports the agent's tool list with its settings. */
  active: boolean;
  report: AgentApprovalReport;
  /** The report's tools by name, for a row's cell. */
  byName: Map<string, ToolSummary>;
  /** agent-manager says the settings are saved but not enforced. */
  notEnforced: boolean;
};

/**
 * An existing agent's approval (tool approval), for its page: its tool list,
 * default and grants as agent-manager reads them (`get_agent`), and what
 * muster reports for them, for the person looking.
 */
export function useAgentApproval(
  installation: string | undefined,
  namespace: string | undefined,
  name: string,
): AgentApproval {
  const { agent } = useAgentManagerAgent(installation, namespace ?? '', name);
  const tools = agentToolListOf(agent);
  const fallback = agent?.defaultApproval;
  const agentTools = useMemo(
    () =>
      tools
        ? agentToolsArgumentOf(
            tools,
            isApprovalSetting(fallback) ? fallback : undefined,
            agent?.grants,
          )
        : undefined,
    [tools, fallback, agent?.grants],
  );
  const report = useAgentApprovalReport(installation, agentTools);
  const byName = useMemo(
    () => new Map(report.tools.map(tool => [tool.name, tool])),
    [report.tools],
  );
  return {
    active: Boolean(agentTools),
    report,
    byName,
    notEnforced: approvalNotEnforced(agent),
  };
}
