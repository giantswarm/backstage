import { useApi } from '@backstage/frontend-plugin-api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ListInstallationsFilters,
  platformCapabilitiesApiRef,
  VerifyResult,
} from '../apis';
import { mergeLive } from '../lib/comparison';

export const QUERY_ROOT = 'platform-capabilities';

export const installationsKey = (filters: ListInstallationsFilters = {}) => [
  QUERY_ROOT,
  'installations',
  filters,
];
export const infoKey = [QUERY_ROOT, 'info'];
export const connectionKey = [QUERY_ROOT, 'connection'];
export const actionsKey = (installation: string) => [
  QUERY_ROOT,
  'actions',
  installation,
];
export const verifyKey = (installation: string, capability: string) => [
  QUERY_ROOT,
  'verify',
  installation,
  capability,
];

export function useInstallations(filters?: ListInstallationsFilters) {
  const api = useApi(platformCapabilitiesApiRef);
  return useQuery({
    queryKey: installationsKey(filters),
    queryFn: () => api.listInstallations(filters),
  });
}

export function useManagerInfo() {
  const api = useApi(platformCapabilitiesApiRef);
  return useQuery({ queryKey: infoKey, queryFn: () => api.getInfo() });
}

/** Whether the person's muster session reaches the manager; Commit needs it. */
export function useConnection() {
  const api = useApi(platformCapabilitiesApiRef);
  return useQuery({
    queryKey: connectionKey,
    queryFn: () => api.getConnection(),
    staleTime: 30_000,
  });
}

/**
 * The comparison of a capability with its definition, run once when the tab
 * opens and kept until a commit invalidates it: it reads every repository and
 * runs the probes, so it is not refetched on focus or remount. It asks for
 * the files' content: the page shows each file as a diff.
 */
export function useComparison(installation: string, capability: string) {
  const api = useApi(platformCapabilitiesApiRef);
  return useQuery({
    queryKey: verifyKey(installation, capability),
    queryFn: () =>
      api.verifyCapability(installation, capability, { content: true }),
    staleTime: Infinity,
  });
}

/**
 * The checks that need the person's session, run as the signed-in person
 * through muster's live registration of the manager, from the comparison's
 * own inputs so both halves render the same, and merged into the comparison
 * the tab holds: the checks that answered take their marks, the rest stays.
 */
export function useLiveVerify(installation: string, capability: string) {
  const api = useApi(platformCapabilitiesApiRef);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (comparison: VerifyResult) => {
      const live = await api.verifyInstallation(installation, capability, {
        inputs: comparison.inputs,
      });
      return mergeLive(comparison, live);
    },
    onSuccess: merged => {
      queryClient.setQueryData(verifyKey(installation, capability), merged);
    },
  });
}

export function useActions(installation: string) {
  const api = useApi(platformCapabilitiesApiRef);
  return useQuery({
    queryKey: actionsKey(installation),
    queryFn: () => api.listActions({ installation }),
  });
}
