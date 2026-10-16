import { useApi } from '@backstage/core-plugin-api';
import { useQueryClient } from '@tanstack/react-query';
import { useTrackedMutation } from '@giantswarm/backstage-plugin-analytics-react';

import { musterApiRef } from '../../apis';
import { isMusterAuthError } from '../../lib/authError';
import {
  takesDisplayName,
  type McpServerAuthMode,
  type McpServerDefinition,
} from '../../lib/mcpServerDefinition';
import { displayNameSupportQuery } from './useTakesDisplayName';

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
 * The definition's `displayName` goes only to a tool whose input schema
 * declares it (muster v5.43.0 and later); an older muster refuses unknown
 * fields, so it gets the definition without it — the connector is then named
 * by its resource name, as before. Each tool's schema is checked on its own.
 * When a schema cannot be read, nothing is written: dropping the name then
 * would lose it without a word. Resolves to the definition the write tool was
 * sent.
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
      const { displayName, ...withoutDisplayName } = definition;
      const definitionFor = async (
        name: string,
      ): Promise<McpServerDefinition> => {
        if (displayName === undefined) {
          return definition;
        }
        const detail = await queryClient
          .fetchQuery(displayNameSupportQuery(musterApi, name, installation))
          .catch(error => {
            if (isMusterAuthError(error)) {
              throw error;
            }
            throw new Error(
              `Muster could not be asked whether it keeps the connector's name (${
                (error as Error)?.message ?? error
              }). Nothing was saved; try again.`,
            );
          });
        return takesDisplayName(detail.inputSchema)
          ? definition
          : withoutDisplayName;
      };
      const [validated, sent] = await Promise.all([
        definitionFor('core_mcpserver_validate'),
        definitionFor(tool),
      ]);
      await musterApi.callTool(
        'core_mcpserver_validate',
        validated,
        installation,
      );
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
