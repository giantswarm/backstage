import { useApi } from '@backstage/core-plugin-api';
import { useQuery } from '@tanstack/react-query';

import { musterApiRef, type MusterApi } from '../../../apis';
import { takesArgument } from '../../../lib/mcpServerDefinition';
import { toolDescriptionQuery } from '../useToolDescription';

/**
 * `describe_tool` of `tool`, read to learn which arguments it takes: the tool
 * page's cache entry, fresh for a few minutes so a save does not ask again
 * right after the Connect step did, and never retried, so a failed read does
 * not hold a save back through the plugin's retry backoff.
 */
export function toolArgumentsQuery(
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
 * Whether the installation's muster `tool` takes `argument` (`displayName`
 * from v5.43.0, `tags` and `clientCredentials` later). False until its schema is read, and when it
 * cannot be read: an older muster refuses an argument it does not know.
 */
export function useToolTakesArgument(
  tool: string,
  installation: string | undefined,
  argument: Parameters<typeof takesArgument>[1],
  options: { enabled?: boolean } = {},
): boolean {
  return useToolArgumentSupport(tool, installation, argument, options) ?? false;
}

/**
 * {@link useToolTakesArgument} that tells "not yet known" apart: undefined
 * while the schema is read or when it cannot be, for a page that hides a
 * control only once muster says no (the save asks again, and says so).
 */
export function useToolArgumentSupport(
  tool: string,
  installation: string | undefined,
  argument: Parameters<typeof takesArgument>[1],
  { enabled = true }: { enabled?: boolean } = {},
): boolean | undefined {
  const musterApi = useApi(musterApiRef);
  const { data } = useQuery({
    ...toolArgumentsQuery(musterApi, tool, installation),
    enabled: enabled && Boolean(installation),
    select: detail => takesArgument(detail.inputSchema, argument),
  });
  return data;
}
