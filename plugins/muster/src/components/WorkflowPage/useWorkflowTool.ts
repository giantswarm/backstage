import { isAwaitingData } from '@giantswarm/backstage-plugin-ui-react';
import type { ToolAnnotations } from '../../apis/types';
import { workflowToolOf } from '../../lib/workflowDisplay';
import { WORKFLOW_TOOL_PREFIX } from '../../lib/workflowReferences';
import { useToolCatalogue, useToolDescription } from '../shared';

/** The workflow's tool as the page needs it: muster's derived annotations. */
export type WorkflowTool = { name: string; annotations?: ToolAnnotations };

export type WorkflowToolState = {
  /**
   * The tool muster runs the workflow as, as it lists it for this session;
   * null where it lists none, undefined while that is unknown.
   */
  tool: WorkflowTool | null | undefined;
  /** Whether the answer is still being read. */
  isAwaiting: boolean;
  error: Error | null;
};

/**
 * The tool muster runs a workflow as (`workflow_<name>`), read off the
 * installation's tool catalogue: the query the flow canvas and the Customize
 * list already read, so the badge and the Run it tab cost no request of
 * their own. The read-only hint is derived per session by the aggregator, so
 * it is read here, never off the CR. A truncated catalogue may stop short of
 * the tool; then describing it says whether muster has it, as on a tool's
 * page — the run form describes it anyway.
 */
export function useWorkflowTool(
  name: string,
  installation: string | undefined,
  enabled: boolean,
): WorkflowToolState {
  const catalogue = useToolCatalogue(installation, enabled);
  const listed = workflowToolOf(name, catalogue.data?.tools);
  const truncated = Boolean(catalogue.data?.truncated);
  const described = useToolDescription(
    `${WORKFLOW_TOOL_PREFIX}${name}`,
    installation,
    { enabled: enabled && truncated && !listed },
  );

  if (listed) {
    return { tool: listed, isAwaiting: false, error: null };
  }
  if (!truncated) {
    return {
      tool: catalogue.data ? null : undefined,
      isAwaiting: isAwaitingData(catalogue),
      error: catalogue.data ? null : catalogue.error,
    };
  }
  return {
    tool: described.data,
    isAwaiting: isAwaitingData(described),
    error: described.data ? null : described.error,
  };
}
