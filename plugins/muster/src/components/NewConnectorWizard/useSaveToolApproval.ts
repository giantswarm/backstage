import { useApi } from '@backstage/core-plugin-api';
import { useQueryClient } from '@tanstack/react-query';
import { useTrackedMutation } from '@giantswarm/backstage-plugin-analytics-react';

import { musterApiRef, type MCPServerApproval } from '../../apis';
import { musterServerListQueryKey } from '../../hooks/useMusterServerAvailability';
import { TOOL_APPROVAL_SAVED } from '../../lib/connectorToolEvents';
import { sameStoredApproval } from '../../lib/toolApproval';

/** The tool that writes a connector's approval settings. */
export const SET_APPROVAL_TOOL = 'core_mcpserver_set_approval';

export type ToolApprovalSave = {
  /** The connector's MCPServer name, in muster's own namespace. */
  name: string;
  installation: string | undefined;
  /** Explicit: a rule and every tool's own setting. */
  approval: Required<MCPServerApproval>;
  /**
   * The stored settings the draft was built on. muster's
   * `core_mcpserver_set_approval` replaces `spec.approval` whole, so the save
   * reads the settings again right before it and writes nothing when they
   * changed since ({@link ToolApprovalConflictError}).
   */
  base: MCPServerApproval | undefined;
  /**
   * muster's `set_approval` takes `expectedGeneration`: the write then
   * carries the generation that read returned, and muster refuses it when
   * the connector changed in between.
   */
  precondition: boolean;
};

/** muster's refusal of a write whose `expectedGeneration` is stale. */
const STALE_GENERATION =
  /^conflict: MCP server '[^']*' changed since it was read/;

/**
 * Someone changed the connector's settings since the draft was built: nothing
 * was saved. The fresh settings are in the server list's cache by then, so the
 * page shows them, with the person's own changes on top.
 */
export class ToolApprovalConflictError extends Error {
  constructor() {
    super(
      'Someone changed this connector since you opened its settings, so yours were not saved over theirs. The settings below are the current ones, with your own changes on top: check them and press Done again.',
    );
    this.name = 'ToolApprovalConflictError';
  }
}

/**
 * Saves a connector's tool approval through muster's
 * `core_mcpserver_set_approval` as the person, so the connector-admin
 * check is Kubernetes RBAC on that write. Always explicit settings, never a
 * `preset`: the wizard expanded the preset already and the person saw each
 * setting before saving.
 *
 * muster replaces the settings whole. The save re-reads them
 * (`core_mcpserver_list`, the step's own query) immediately before writing
 * and refuses to overwrite a change made since the draft was built; where
 * muster takes `expectedGeneration`, the write carries the generation of
 * that read, so muster also refuses a change made between the read and the
 * write. A muster without it leaves that moment open.
 */
export function useSaveToolApproval() {
  const musterApi = useApi(musterApiRef);
  const queryClient = useQueryClient();
  return useTrackedMutation({
    mutationFn: async ({
      name,
      installation,
      approval,
      base,
      precondition,
    }: ToolApprovalSave) => {
      const fresh = await queryClient.fetchQuery({
        queryKey: musterServerListQueryKey(installation),
        queryFn: () => musterApi.listServers(installation),
        staleTime: 0,
      });
      const server = fresh.mcpServers?.find(entry => entry.name === name);
      if (!sameStoredApproval(server?.approval, base)) {
        throw new ToolApprovalConflictError();
      }
      const generation = server?.generation;
      try {
        return await musterApi.callTool(
          SET_APPROVAL_TOOL,
          {
            name,
            approval,
            ...(precondition &&
              typeof generation === 'number' && {
                expectedGeneration: generation,
              }),
          },
          installation,
        );
      } catch (error) {
        if (error instanceof Error && STALE_GENERATION.test(error.message)) {
          await queryClient.invalidateQueries({
            queryKey: musterServerListQueryKey(installation),
          });
          throw new ToolApprovalConflictError();
        }
        throw error;
      }
    },
    event: () => TOOL_APPROVAL_SAVED,
    // The connector, its tools and their reported approval change.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['muster'] }),
  });
}
