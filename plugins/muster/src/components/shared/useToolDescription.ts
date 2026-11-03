import { useApi } from '@backstage/frontend-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { musterApiRef, type MusterApi } from '../../apis';

/**
 * The query behind {@link useToolDescription}, for a caller outside a
 * component — a mutation that reads a tool's schema before it calls the tool
 * shares the cached entry.
 */
export function toolDescriptionQuery(
  musterApi: MusterApi,
  name: string,
  installation: string | undefined,
) {
  return {
    queryKey: ['muster', 'describe-tool', installation, name],
    queryFn: () => musterApi.describeTool(name, installation),
  };
}

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
    ...toolDescriptionQuery(musterApi, name, installation),
    enabled,
  });
}
