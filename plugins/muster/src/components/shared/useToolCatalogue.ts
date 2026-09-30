import { useApi } from '@backstage/frontend-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { musterApiRef } from '../../apis';

/**
 * The limit of one catalogue read. The Tool explorer's browse query uses the
 * same key and limit, so the two share a cache entry.
 */
export const TOOL_CATALOGUE_LIMIT = 2000;

/**
 * The installation's whole tool catalogue in one `filter_tools` request --
 * what the servers list counts and searches per row, and what a family's
 * tools are read from (their per-instance fallbacks match no single pattern).
 * Session-scoped, so callers disable it without a muster session.
 */
export function useToolCatalogue(
  installation: string | undefined,
  enabled: boolean,
) {
  const musterApi = useApi(musterApiRef);
  return useQuery({
    queryKey: ['muster', 'tools-browse', installation],
    queryFn: () =>
      musterApi.filterTools({ installation, limit: TOOL_CATALOGUE_LIMIT }),
    enabled: enabled && Boolean(installation),
  });
}
