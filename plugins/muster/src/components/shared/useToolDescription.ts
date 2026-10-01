import { useApi } from '@backstage/frontend-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { musterApiRef } from '../../apis';

/**
 * A tool as muster describes it (`describe_tool`): description, annotations
 * and input schema. One cached request per tool and installation, shared by
 * a tool's page and its argument form.
 */
export function useToolDescription(
  name: string,
  installation: string | undefined,
  { enabled = true }: { enabled?: boolean } = {},
) {
  const musterApi = useApi(musterApiRef);
  return useQuery({
    queryKey: ['muster', 'describe-tool', installation, name],
    queryFn: () => musterApi.describeTool(name, installation),
    enabled,
  });
}
