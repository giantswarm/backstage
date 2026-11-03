import { useApi } from '@backstage/core-plugin-api';
import { useQuery } from '@tanstack/react-query';

import { musterApiRef, type MusterApi } from '../../apis';
import { takesDisplayName, takesTags } from '../../lib/mcpServerDefinition';
import { toolDescriptionQuery } from '../shared/useToolDescription';

type ToolInputSchema = Parameters<typeof takesTags>[0];

/**
 * `describe_tool` of `tool`, read to learn whether it takes a display name: the
 * tool page's cache entry, fresh for a few minutes so a save does not ask again
 * right after the Connect step did, and never retried, so a failed read does
 * not hold a save back through the plugin's retry backoff.
 */
export function displayNameSupportQuery(
  musterApi: MusterApi,
  tool: string,
  installation: string | undefined,
) {
  return {
    ...toolDescriptionQuery(musterApi, tool, installation),
    staleTime: 5 * 60_000,
    retry: false,
  };
}

/** Whether `tool`'s input schema passes `takes`; false until it is read. */
function useToolSchemaTakes(
  tool: string,
  installation: string | undefined,
  enabled: boolean,
  takes: (inputSchema: ToolInputSchema) => boolean,
): boolean {
  const musterApi = useApi(musterApiRef);
  const { data } = useQuery({
    ...displayNameSupportQuery(musterApi, tool, installation),
    enabled,
    select: detail => takes(detail.inputSchema),
  });
  return data ?? false;
}

/**
 * Whether the installation's muster `tool` takes `displayName` (v5.43.0 and
 * later). False until its schema is read, and when it cannot be read.
 */
export function useTakesDisplayName(
  tool: string,
  installation: string | undefined,
  { enabled = true }: { enabled?: boolean } = {},
): boolean {
  return useToolSchemaTakes(tool, installation, enabled, takesDisplayName);
}

/**
 * Whether the installation's muster `tool` takes `tags`, read from its input
 * schema like {@link useTakesDisplayName}. False until the schema is read, and
 * when it cannot be read: an older muster refuses the argument.
 */
export function useTakesTags(
  tool: string,
  installation: string | undefined,
  { enabled = true }: { enabled?: boolean } = {},
): boolean {
  return useToolSchemaTakes(
    tool,
    installation,
    enabled && Boolean(installation),
    takesTags,
  );
}
