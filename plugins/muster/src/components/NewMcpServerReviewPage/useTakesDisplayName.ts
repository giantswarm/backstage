import { useApi } from '@backstage/core-plugin-api';
import { useQuery } from '@tanstack/react-query';

import { musterApiRef, type MusterApi } from '../../apis';
import {
  takesClientCredentials,
  takesDisplayName,
} from '../../lib/mcpServerDefinition';
import { toolDescriptionQuery } from '../shared/useToolDescription';

/**
 * `describe_tool` of a muster write tool, read to learn which optional
 * arguments it takes (a display name, a client to store): the tool page's
 * cache entry, fresh for a few minutes so a save does not ask again right
 * after a step did, and never retried, so a failed read does not hold a save
 * back through the plugin's retry backoff.
 */
export function writeToolSchemaQuery(
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
    ...writeToolSchemaQuery(musterApi, tool, installation),
    enabled,
    select: detail => takesDisplayName(detail.inputSchema),
  });
  return data ?? false;
}

/**
 * Whether the installation's muster `tool` takes `clientCredentials`
 * (giantswarm/muster#1737): false once its schema is read without it,
 * undefined while it is read or when it cannot be. The client fields wait
 * only for a "no": a failed read leaves the save to ask again, and to say
 * so.
 */
export function useTakesClientCredentials(
  tool: string,
  installation: string | undefined,
  { enabled = true }: { enabled?: boolean } = {},
): boolean | undefined {
  const musterApi = useApi(musterApiRef);
  const { data } = useQuery({
    ...writeToolSchemaQuery(musterApi, tool, installation),
    enabled,
    select: detail => takesClientCredentials(detail.inputSchema),
  });
  return data;
}
