import { useApi } from '@backstage/core-plugin-api';
import { useQueryClient } from '@tanstack/react-query';
import { useTrackedMutation } from '@giantswarm/backstage-plugin-analytics-react';

import { musterApiRef, type MCPServerApproval } from '../../apis';
import { TOOL_APPROVAL_SAVED } from '../../lib/connectorToolEvents';

/** The tool that writes a connector's approval settings. */
export const SET_APPROVAL_TOOL = 'core_mcpserver_set_approval';

export type ToolApprovalSave = {
  /** The connector's MCPServer name, in muster's own namespace. */
  name: string;
  installation: string | undefined;
  /** Explicit: a rule and every tool's own setting. */
  approval: Required<MCPServerApproval>;
};

/**
 * Saves a connector's tool approval through muster's
 * `core_mcpserver_set_approval` as the person, so the connector-admin
 * check is Kubernetes RBAC on that write. Always explicit settings, never a
 * `preset`: the wizard expanded the preset already and the person saw each
 * setting before saving.
 */
export function useSaveToolApproval() {
  const musterApi = useApi(musterApiRef);
  const queryClient = useQueryClient();
  return useTrackedMutation({
    mutationFn: ({ name, installation, approval }: ToolApprovalSave) =>
      musterApi.callTool(SET_APPROVAL_TOOL, { name, approval }, installation),
    event: () => TOOL_APPROVAL_SAVED,
    // The connector, its tools and their reported approval change.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['muster'] }),
  });
}
