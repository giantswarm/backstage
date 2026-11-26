import { useApiHolder } from '@backstage/core-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { AGENT_MANAGER_SERVER } from '@giantswarm/backstage-plugin-gs-common';

import { musterApiRef, type MusterApi } from '../apis';

/**
 * One agent that may skip an `Ask` of the connector, as agent-manager
 * records it (`list_approval_grants`, tool approval milestone 2).
 */
export type ApprovalGrant = {
  agent?: { namespace: string; name: string };
  /** The agent's tool list entry: `tool:x`, `server:y`, `preset:z`, or `default`. */
  entry: string;
  server: string;
  grantedBy?: string;
  grantedAt?: string;
};

function parsed<T>(result: unknown): T {
  return (typeof result === 'string' ? JSON.parse(result) : result) as T;
}

async function grantsOf(
  api: MusterApi,
  installation: string,
  server: string,
): Promise<ApprovalGrant[]> {
  const tool = (name: string) => `x_${AGENT_MANAGER_SERVER}_${name}`;
  // Grants are listed per agent namespace: the ones agent-manager manages,
  // else its default one.
  let namespaces: (string | undefined)[] = [undefined];
  try {
    const info = parsed<{ namespaces?: { managed?: string[] } }>(
      await api.callTool(tool('get_info'), {}, installation),
    );
    if (info.namespaces?.managed?.length) {
      namespaces = info.namespaces.managed;
    }
  } catch {
    // Without get_info, the default namespace only.
  }
  const lists = await Promise.all(
    namespaces.map(namespace =>
      api
        .callTool(
          tool('list_approval_grants'),
          { ...(namespace && { namespace }), server },
          installation,
        )
        .then(
          result => parsed<{ grants?: ApprovalGrant[] }>(result).grants ?? [],
        )
        // A namespace the person may not list, or an agent-manager without
        // grants: none from there.
        .catch(() => [] as ApprovalGrant[]),
    ),
  );
  return lists.flat();
}

/**
 * The agents that may run a connector's asking tools without asking, and
 * who let them: agent-manager's grants on the connector (by muster's server
 * key), read as the person. Empty where agent-manager has none or is absent.
 */
export function useApprovalGrants(
  installation: string,
  server: string | undefined,
): ApprovalGrant[] {
  // Optional: a page rendered without muster's API shows no grants.
  const api = useApiHolder().get(musterApiRef);
  const { data } = useQuery({
    queryKey: ['muster', 'approval-grants', installation, server ?? ''],
    queryFn: () => grantsOf(api!, installation, server!),
    enabled: Boolean(server && api),
    retry: false,
    staleTime: 30_000,
  });
  return data ?? [];
}

/** "Alert Review (by dana@example.com)": an agent a grant names, and who granted it. */
export function grantLabel(grant: ApprovalGrant): string {
  const name = grant.agent?.name ?? 'an agent';
  return grant.grantedBy ? `${name} (by ${grant.grantedBy})` : name;
}
