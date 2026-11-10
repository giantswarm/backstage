import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTrackedMutation } from '@giantswarm/backstage-plugin-analytics-react';
import { isAwaitingData } from '@giantswarm/backstage-plugin-ui-react';

import { AgentManagerError } from '../lib/agentManager';
import {
  ORGANIZATIONS_CAPABILITY,
  type MemberRequest,
  type MemberResult,
  type OrganizationConnector,
  type OrganizationDetails,
  type OrganizationMember,
  type OrganizationListing,
} from '../lib/organizations';
import {
  musterOrganizationsQueryKey,
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
 * `list_organizations` on one installation: the organizations the person
 * manages or belongs to, each with their permissions, and who can add them
 * when there is none. Asked only where agent-manager serves the organization
 * tools.
 */
export function useOrganizations(
  installation: string | undefined,
): OrganizationRead<OrganizationListing> &
  Omit<ReturnType<typeof useOrganizationsSupported>, 'isLoading'> & {
    /** Reads `list_organizations` again. */
    refetch: () => Promise<unknown>;
  } {
  const client = useAgentManagerClient(installation);
  const { supported, infoError, recheck } =
    useOrganizationsSupported(installation);
  const enabled = Boolean(client) && supported === true;
  const query = useQuery({
    queryKey: musterOrganizationsQueryKey(installation ?? ''),
    enabled,
    queryFn: () => client!.listOrganizations(),
    staleTime: 60_000,
    retry: false,
  });
  return {
    ...readOf(enabled, query),
    supported,
    infoError,
    recheck,
    refetch: query.refetch,
  };
}

const ERASING_POLL_INTERVAL_MS = 10_000;

function isNotFound(error: unknown): boolean {
  return error instanceof AgentManagerError && error.code === 'not_found';
}

/**
 * `get_organization`: the organization object and what a delete would erase.
 * Only an organizations-admin may read it, so it is asked only when
 * `list_organizations` says the person manages the organization. While the
 * organization is deleting it is read again every 10 s, until the read
 * answers `not_found`: the operator erased it.
 */
export function useOrganizationDetails(
  installation: string,
  parent: string,
  name: string,
  options: { enabled?: boolean } = {},
): OrganizationRead<OrganizationDetails> {
  const client = useAgentManagerClient(installation);
  const enabled = Boolean(client) && (options.enabled ?? true);
  const query = useQuery({
    queryKey: musterOrganizationQueryKey(installation, parent, name),
    enabled,
    queryFn: () => client!.getOrganization(parent, name),
    staleTime: 60_000,
    refetchInterval: ({ state }) =>
      state.data?.organization.deleting && !isNotFound(state.error)
        ? ERASING_POLL_INTERVAL_MS
        : false,
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
