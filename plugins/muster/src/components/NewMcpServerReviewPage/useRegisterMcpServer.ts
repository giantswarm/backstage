import { useApi } from '@backstage/core-plugin-api';
import { useQueryClient } from '@tanstack/react-query';
import { useTrackedMutation } from '@giantswarm/backstage-plugin-analytics-react';

import { musterApiRef } from '../../apis';
import type {
  McpServerAuthMode,
  McpServerDefinition,
} from '../../lib/mcpServerDefinition';

export type McpServerRegistration = {
  definition: McpServerDefinition;
  installation: string | undefined;
  authMode: McpServerAuthMode;
  /** The wizard run already registered the server: update it in place. */
  isEdit: boolean;
};

/**
 * The wizard's write, through muster's own core tools over the per-user MCP
 * session — the same live write path the raw-JSON dialog and the CLI use.
 * Validate runs as a dry-run first, so the definition is checked by the
 * authority that will apply it; then create, or update when this wizard run
 * registered the server already (never a delete-and-recreate). A create is
 * reported as `Muster.mcpServerAdded`; an edit is not an addition.
 */
export function useRegisterMcpServer() {
  const musterApi = useApi(musterApiRef);
  const queryClient = useQueryClient();

  return useTrackedMutation({
    mutationFn: async ({
      definition,
      installation,
      isEdit,
    }: McpServerRegistration) => {
      await musterApi.callTool(
        'core_mcpserver_validate',
        definition,
        installation,
      );
      await musterApi.callTool(
        isEdit ? 'core_mcpserver_update' : 'core_mcpserver_create',
        definition,
        installation,
      );
    },
    event: (_data, { isEdit, authMode }) =>
      isEdit
        ? null
        : { name: 'Muster.mcpServerAdded', attributes: { authMode } },
    // The CR exists now — refresh every muster read (server lists, tools) so
    // the verify step opens on live data.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['muster'] }),
  });
}
