import { useQuery } from '@tanstack/react-query';
import { isAwaitingData } from '@giantswarm/backstage-plugin-ui-react';
// eslint-disable-next-line @backstage/no-mixed-plugin-imports -- Approvals are what muster reports for an agent's tool list.
import type {
  AgentToolsArgument,
  ToolSummary,
} from '@giantswarm/backstage-plugin-muster';

import { musterAgentApprovalReportQueryKey } from '../lib/queryKeys';
import { portalSessionError } from '../lib/portalSession';
import { useMusterPluginApi } from './useMusterPluginApi';

/** As agent-manager pages muster's report (contract §5). */
export const REPORT_PAGE_SIZE = 500;
/** A bound on the pages read: far beyond any real catalogue. */
const MAX_PAGES = 20;

export type AgentApprovalReport = {
  /**
   * `ready`: muster reported the list's tools with the agent's approvals.
   * `unsupported`: this muster takes no `agentTools` (it answered without
   * evaluating the list). `error`: the read failed (`error` says why).
   * `idle`: no list to report.
   */
  status: 'idle' | 'loading' | 'ready' | 'unsupported' | 'error';
  /** The tools the list selects, each with its approval for the agent. */
  tools: ToolSummary[];
  truncated: boolean;
  error?: string;
  /** The governance mode muster reports beside the tools, if any. */
  governance?: string;
};

const NONE: ToolSummary[] = [];

/**
 * What muster reports for an agent's tool list (`filter_tools` with
 * `agentTools`, reporting only): every tool the list selects, with the
 * approval that agent would get — the deciding entry, the connector's own
 * setting — the connectors behind it and whether the person is their
 * connector admin. Read as the person, never persisted.
 */
export function useAgentApprovalReport(
  installation: string | undefined,
  agentTools: AgentToolsArgument | undefined,
): AgentApprovalReport {
  const musterApi = useMusterPluginApi();
  const enabled = Boolean(installation && musterApi && agentTools);
  const { data, error, isPending, fetchStatus } = useQuery({
    queryKey: musterAgentApprovalReportQueryKey(
      installation ?? '',
      JSON.stringify(agentTools ?? null),
    ),
    enabled,
    queryFn: async () => {
      // Every page, as agent-manager reads it: a tool past the first page
      // still decides whether an Allow needs a grant.
      const tools: ToolSummary[] = [];
      let page;
      try {
        for (let index = 0; index < MAX_PAGES; index++) {
          page = await musterApi!.filterTools({
            installation,
            agentTools,
            limit: REPORT_PAGE_SIZE,
            offset: index * REPORT_PAGE_SIZE,
          });
          tools.push(...(page.tools ?? []));
          if (!page.truncated || (page.tools ?? []).length === 0) {
            break;
          }
        }
      } catch (failure) {
        throw portalSessionError(failure);
      }
      return { ...page!, tools };
    },
    retry: false,
    // Keeps the last report while a pill change is read again, so the rows
    // do not flash away under the pointer.
    placeholderData: previous => previous,
  });
  if (!enabled) {
    return { status: 'idle', tools: NONE, truncated: false };
  }
  if (error) {
    return {
      status: 'error',
      tools: NONE,
      truncated: false,
      error: (error as Error).message,
    };
  }
  if (!data) {
    return {
      status: isAwaitingData({ isPending, fetchStatus }) ? 'loading' : 'idle',
      tools: NONE,
      truncated: false,
    };
  }
  // A muster that evaluates agent lists echoes the list (C-07); one that
  // ignores the argument answers its catalogue, which is no report.
  if (!data.agentTools) {
    return { status: 'unsupported', tools: NONE, truncated: false };
  }
  return {
    status: 'ready',
    tools: data.tools ?? NONE,
    truncated: Boolean(data.truncated),
    governance: data.governance,
  };
}
