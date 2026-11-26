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
  /** The agent's name as people see it. */
  agentDisplayName?: string;
  /** The agent's tool list entry: `tool:x`, `server:y`, `preset:z`, or `default`. */
  entry: string;
  server: string;
  /** The connector's own names of the tools the exception covers. */
  tools?: string[];
  grantedBy?: string;
  grantedAt?: string;
};

function parsed<T>(result: unknown): T {
  return (typeof result === 'string' ? JSON.parse(result) : result) as T;
}

/**
 * What was read of the connector's grants: `partial` when a namespace could
 * not be listed (`refused`: agent-manager said the person may not), `error`
 * when nothing could be read. Never an empty list standing for "nobody".
 */
export type ApprovalGrantsReading = {
  status: 'idle' | 'loading' | 'ready' | 'partial' | 'error';
  grants: ApprovalGrant[];
  /** Some namespace was refused for this person (`forbidden`). */
  refused: boolean;
};

async function grantsOf(
  api: MusterApi,
  installation: string,
  server: string,
): Promise<
  (Omit<ApprovalGrantsReading, 'status'> & { partial: boolean }) | undefined
> {
  let result: unknown;
  try {
    // Without a namespace: every namespace the person may read, the others
    // named as unreadable (contract §2, #86 item 11).
    result = await api.callTool(
      `x_${AGENT_MANAGER_SERVER}_list_approval_grants`,
      { server },
      installation,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // An agent-manager without grants has nothing to list.
    if (/tool not found|unknown tool/i.test(message)) {
      return undefined;
    }
    throw error;
  }
  const answer = parsed<{ grants?: ApprovalGrant[]; unreadable?: string[] }>(
    result,
  );
  const unreadable = answer.unreadable ?? [];
  return {
    grants: answer.grants ?? [],
    refused: unreadable.length > 0,
    partial: unreadable.length > 0,
  };
}

/**
 * The agents that may run a connector's asking tools without asking, and
 * who let them: agent-manager's grants on the connector (by muster's server
 * key), read as the person, with how complete the reading is.
 */
export function useApprovalGrants(
  installation: string,
  server: string | undefined,
): ApprovalGrantsReading {
  // Optional: a page rendered without muster's API shows no grants.
  const api = useApiHolder().get(musterApiRef);
  const enabled = Boolean(server && api);
  const { data, isError } = useQuery({
    queryKey: ['muster', 'approval-grants', installation, server ?? ''],
    // `null`, not undefined: an agent-manager without grants.
    queryFn: async () => (await grantsOf(api!, installation, server!)) ?? null,
    enabled,
    retry: false,
    staleTime: 30_000,
  });
  if (!enabled) {
    return { status: 'idle', grants: [], refused: false };
  }
  if (data === undefined) {
    return {
      status: isError ? 'error' : 'loading',
      grants: [],
      refused: false,
    };
  }
  if (data === null) {
    return { status: 'idle', grants: [], refused: false };
  }
  const status: ApprovalGrantsReading['status'] = data.partial
    ? 'partial'
    : 'ready';
  return { status, grants: data.grants, refused: data.refused };
}

/** "Alert Review (by dana@example.com)": an agent a grant names, and who granted it. */
export function grantLabel(grant: ApprovalGrant): string {
  const name = grant.agentDisplayName || grant.agent?.name || 'an agent';
  return grant.grantedBy ? `${name} (by ${grant.grantedBy})` : name;
}
