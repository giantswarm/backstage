import { useApi } from '@backstage/core-plugin-api';
import { useQuery } from '@tanstack/react-query';

import { musterApiRef, type MusterApi } from '../../apis';
import { takesDisplayName } from '../../lib/mcpServerDefinition';
import { toolDescriptionQuery } from '../shared/useToolDescription';

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

/**
 * Whether the installation's muster `tool` takes `displayName` (v5.43.0 and
 * later). False until its schema is read, and when it cannot be read.
 */
export function useTakesDisplayName(
  tool: string,
  installation: string | undefined,
  { enabled = true }: { enabled?: boolean } = {},
): boolean {
  const musterApi = useApi(musterApiRef);
  const { data } = useQuery({
    ...displayNameSupportQuery(musterApi, tool, installation),
    enabled,
    select: detail => takesDisplayName(detail.inputSchema),
  });
  return data ?? false;
}
