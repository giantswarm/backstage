import { useApi } from '@backstage/core-plugin-api';
import { useQuery } from '@tanstack/react-query';

import { musterApiRef, type GovernanceMode } from '../apis';

/**
 * The installation's governance mode, as muster says it of itself
 * (`/server-info`, the query `useMusterIcon` shares): `trusted` until muster
 * reports one, from a muster that does not and when it cannot be asked —
 * the default mode, under which an upgrade changes nothing. It only picks the
 * preset the connector wizard pre-selects; muster enforces the rest.
 */
export function useGovernanceMode(
  installation: string | undefined,
): GovernanceMode {
  const musterApi = useApi(musterApiRef);
  const { data } = useQuery({
    queryKey: ['muster', 'server-info', installation],
    queryFn: () => musterApi.getServerInfo(installation),
    enabled: Boolean(installation),
    staleTime: 10 * 60_000,
    retry: false,
  });
  return data?.governance === 'governed' ? 'governed' : 'trusted';
}
