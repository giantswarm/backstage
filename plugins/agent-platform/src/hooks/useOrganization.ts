import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTrackedMutation } from '@giantswarm/backstage-plugin-analytics-react';
import { isAwaitingData } from '@giantswarm/backstage-plugin-ui-react';

import {
  ORGANIZATIONS_CAPABILITY,
  type MemberRequest,
  type MemberResult,
  type MyOrganizations,
  type OrganizationConnector,
  type OrganizationDetails,
  type OrganizationMember,
} from '../lib/organizations';
import {
  musterMyOrganizationsQueryKey,
  musterOrganizationConnectorsQueryKey,
  musterOrganizationMembersQueryKey,
  musterOrganizationQueryKey,
} from '../lib/queryKeys';
import { useAgentManagerClient, useAgentManagerInfo } from './useAgentManager';
import {
  classifyReadFailure,
  type AgentManagerReadFailure,
} from './useAgentManagerAgent';

/** A read of one organization tool. */
export type OrganizationRead<T> = {
  data: T | undefined;
  isLoading: boolean;
  failure?: AgentManagerReadFailure;
};

function readOf<T>(
  enabled: boolean,
  query: {
    data: T | undefined;
    error: unknown;
    isPending: boolean;
    fetchStatus: 'fetching' | 'paused' | 'idle';
  },
): OrganizationRead<T> {
  return {
    data: query.data,
    isLoading: enabled && isAwaitingData(query),
    failure: query.error ? classifyReadFailure(query.error) : undefined,
  };
}

/**
 * Whether an installation's agent-manager serves the organization tools
 * (`get_info`'s `organizations` capability). `undefined` until it answered.
 */
export function useOrganizationsSupported(installation: string | undefined): {
  /** `undefined` while unknown: not answered yet, or `get_info` failed. */
  supported: boolean | undefined;
  isLoading: boolean;
  /** Why `get_info` could not be read, if it could not. */
  infoError: Error | null;
  /** Reads `get_info` again. */
  recheck: () => Promise<unknown>;
} {
  const { info, isLoading, error, refetch } = useAgentManagerInfo(installation);
  return {
    supported: info
      ? info.capabilities?.[ORGANIZATIONS_CAPABILITY] === true
      : undefined,
    isLoading: !info && isLoading,
    infoError: info ? null : error,
    recheck: refetch,
  };
}

/**
 * `list_my_organizations` on one installation: the organizations the person
 * belongs to, and who can add them when there is none. Asked only where
 * agent-manager serves the organization tools.
 */
export function useMyOrganizations(
  installation: string | undefined,
): OrganizationRead<MyOrganizations> &
  Omit<ReturnType<typeof useOrganizationsSupported>, 'isLoading'> {
  const client = useAgentManagerClient(installation);
  const { supported, infoError, recheck } =
    useOrganizationsSupported(installation);
  const enabled = Boolean(client) && supported === true;
  const query = useQuery({
    queryKey: musterMyOrganizationsQueryKey(installation ?? ''),
    enabled,
    queryFn: () => client!.listMyOrganizations(),
    staleTime: 60_000,
    retry: false,
  });
  return { ...readOf(enabled, query), supported, infoError, recheck };
}

/**
 * `get_organization`: the organization object, for its display name. Only an
 * organizations-admin may read it; a member's read is refused, and the page
 * names the organization by its name then.
 */
export function useOrganizationDetails(
  installation: string,
  parent: string,
  name: string,
): OrganizationRead<OrganizationDetails> {
  const client = useAgentManagerClient(installation);
  const enabled = Boolean(client);
  const query = useQuery({
    queryKey: musterOrganizationQueryKey(installation, parent, name),
    enabled,
    queryFn: () => client!.getOrganization(parent, name),
    staleTime: 60_000,
    retry: false,
  });
  return readOf(enabled, query);
}

/** `list_organization_members`: groups first, each with its role. */
export function useOrganizationMembers(
  installation: string,
  namespace: string | undefined,
): OrganizationRead<OrganizationMember[]> {
  const client = useAgentManagerClient(installation);
  const enabled = Boolean(client) && Boolean(namespace);
  const query = useQuery({
    queryKey: musterOrganizationMembersQueryKey(installation, namespace ?? ''),
    enabled,
    queryFn: async () =>
      (await client!.listOrganizationMembers(namespace!)).members,
    staleTime: 30_000,
    retry: false,
  });
  return readOf(enabled, query);
}

/** `list_organization_connectors`: the organization's RemoteMCPServers. */
export function useOrganizationConnectors(
  installation: string,
  namespace: string | undefined,
): OrganizationRead<OrganizationConnector[]> {
  const client = useAgentManagerClient(installation);
  const enabled = Boolean(client) && Boolean(namespace);
  const query = useQuery({
    queryKey: musterOrganizationConnectorsQueryKey(
      installation,
      namespace ?? '',
    ),
    enabled,
    queryFn: () => client!.listOrganizationConnectors(namespace!),
    staleTime: 60_000,
    retry: false,
  });
  return readOf(enabled, query);
}

/** A member's kind as the events report it. */
function memberKind(request: MemberRequest): 'group' | 'person' {
  return request.group ? 'group' : 'person';
}

/**
 * Adding and removing an organization's members as the person
 * (`add_organization_member`, `remove_organization_member`). A refusal is
 * agent-manager's, in its own words: the page shows it as it comes, the
 * removal of `organization-admins`' last admin among them.
 */
export function useOrganizationMemberWrites(
  installation: string,
  namespace: string,
) {
  const client = useAgentManagerClient(installation);
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: musterOrganizationMembersQueryKey(installation, namespace),
    });

  const add = useTrackedMutation<MemberResult, Error, MemberRequest>({
    event: (result, request) =>
      result.changed
        ? {
            name: 'AgentPlatform.organizationMemberAdded',
            attributes: {
              kind: memberKind(request),
              role: request.role ?? 'user',
            },
          }
        : null,
    mutationFn: request => {
      if (!client) {
        throw new Error('agent-manager is not reachable on this installation.');
      }
      return client.addOrganizationMember(request);
    },
    onSuccess: refresh,
  });

  const remove = useTrackedMutation<MemberResult, Error, MemberRequest>({
    event: (result, request) =>
      result.changed
        ? {
            name: 'AgentPlatform.organizationMemberRemoved',
            attributes: { kind: memberKind(request) },
          }
        : null,
    mutationFn: request => {
      if (!client) {
        throw new Error('agent-manager is not reachable on this installation.');
      }
      return client.removeOrganizationMember(request);
    },
    onSuccess: refresh,
  });

  return { add, remove };
}
