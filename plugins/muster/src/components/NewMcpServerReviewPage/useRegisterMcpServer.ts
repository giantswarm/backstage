import { useApi } from '@backstage/core-plugin-api';
import { useQueryClient } from '@tanstack/react-query';
import { useTrackedMutation } from '@giantswarm/backstage-plugin-analytics-react';

import { musterApiRef } from '../../apis';
import {
  takesDisplayName,
  type McpServerAuthMode,
  type McpServerDefinition,
} from '../../lib/mcpServerDefinition';
import { toolDescriptionQuery } from '../shared/useToolDescription';

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
 *
 * The definition's `displayName` goes only to a muster whose tool declares it
 * (v5.43.0 and later); an older one refuses unknown fields, so it gets the
 * definition without it — the connector is then named by its resource name,
 * as before. Resolves to the definition as sent.
 */
export function useRegisterMcpServer() {
  const musterApi = useApi(musterApiRef);
  const queryClient = useQueryClient();

  return useTrackedMutation({
    mutationFn: async ({
      definition,
      installation,
      isEdit,
    }: McpServerRegistration): Promise<McpServerDefinition> => {
      const tool = isEdit ? 'core_mcpserver_update' : 'core_mcpserver_create';
      let sent = definition;
      if (definition.displayName !== undefined) {
        const detail = await queryClient
          .fetchQuery(toolDescriptionQuery(musterApi, tool, installation))
          .catch(() => undefined);
        if (!takesDisplayName(detail?.inputSchema)) {
          const { displayName: _unsupported, ...rest } = definition;
          sent = rest;
        }
      }
      await musterApi.callTool('core_mcpserver_validate', sent, installation);
      await musterApi.callTool(tool, sent, installation);
      return sent;
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
