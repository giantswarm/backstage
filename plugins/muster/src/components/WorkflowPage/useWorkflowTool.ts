import { useApi } from '@backstage/frontend-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { musterApiRef } from '../../apis';
import type { ToolSummary } from '../../apis/types';

/**
 * The tool muster runs a workflow as (`workflow_<name>`), as it lists it for
 * this session, or null where it lists none. A name filter, not
 * `describe_tool`: a tool muster does not offer is an answer here, where
 * describing it fails. The read-only hint is derived per session by the
 * aggregator, so the page's badge is read off it, never off the CR.
 */
export function useWorkflowTool(
  toolName: string,
  installation: string | undefined,
  enabled: boolean,
) {
  const musterApi = useApi(musterApiRef);
  return useQuery<ToolSummary | null>({
    queryKey: ['muster', 'workflow-tool', installation, toolName],
    queryFn: async () => {
      const response = await musterApi.filterTools({
        installation,
        pattern: toolName,
        limit: 10,
      });
      // The pattern ignores case; the name does not.
      return response.tools?.find(tool => tool.name === toolName) ?? null;
    },
    enabled,
    staleTime: 30_000,
  });
}
