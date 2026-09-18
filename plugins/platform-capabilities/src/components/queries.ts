import { useApi } from '@backstage/frontend-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { ListInstallationsFilters, platformCapabilitiesApiRef } from '../apis';

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
/** One installation's `verify_capability` answer for a capability. */
export const verifyKey = (installation: string, capability: string) => [
  QUERY_ROOT,
  'verify',
  capability,
  installation,
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

export function useActions(installation: string) {
  const api = useApi(platformCapabilitiesApiRef);
  return useQuery({
    queryKey: actionsKey(installation),
    queryFn: () => api.listActions({ installation }),
  });
}
