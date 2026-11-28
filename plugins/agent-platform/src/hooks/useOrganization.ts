import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTrackedMutation } from '@giantswarm/backstage-plugin-analytics-react';
import { isAwaitingData } from '@giantswarm/backstage-plugin-ui-react';

import { AgentManagerError } from '../lib/agentManager';
import { organizationOwnConnectors } from '../lib/organizationConnectors';
import {
  ORGANIZATIONS_CAPABILITY,
  modeArgument,
  organizationContentMode,
  type ListedOrganization,
  type MemberRequest,
  type MemberResult,
  type OrganizationAdmins,
  type OrganizationConnector,
  type OrganizationCreateRequest,
  type OrganizationCreateResult,
  type OrganizationUpdateResult,
  type OrganizationDeleteMode,
  type OrganizationDeleteResult,
  type OrganizationDetails,
  type OrganizationMember,
  type OrganizationNamespace,
  type OrganizationListing,
} from '../lib/organizations';
import {
  musterOrganizationsQueryKey,
  musterOrganizationConnectorsQueryKey,
  musterOrganizationErasureQueryKey,
  musterOrganizationMembersQueryKey,
  musterOrganizationQueryKey,
} from '../lib/queryKeys';
import { useAgentManagerClient, useAgentManagerInfo } from './useAgentManager';
import { useOrganizationContentMode } from './useOrganizationContentMode';
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
  name: string,
  options: { enabled?: boolean } = {},
): OrganizationRead<OrganizationDetails> {
  const client = useAgentManagerClient(installation);
  const enabled = Boolean(client) && (options.enabled ?? true);
  const query = useQuery({
    queryKey: musterOrganizationQueryKey(installation, name),
    enabled,
    queryFn: () => client!.getOrganization(name),
    staleTime: 60_000,
    refetchInterval: ({ state }) =>
      state.data?.organization.deleting && !isNotFound(state.error)
        ? ERASING_POLL_INTERVAL_MS
        : false,
    retry: false,
  });
  return readOf(enabled, query);
}

/**
 * `list_organization_members` of an organization, by its name: groups
 * first, each with its role. Not asked without one.
 */
export function useOrganizationMembers(
  installation: string,
  organization: string | undefined,
): OrganizationRead<OrganizationMember[]> {
  const client = useAgentManagerClient(installation);
  const enabled = Boolean(client) && Boolean(organization);
  const query = useQuery({
    queryKey: musterOrganizationMembersQueryKey(
      installation,
      organization ?? '',
    ),
    enabled,
    queryFn: async () =>
      (await client!.listOrganizationMembers(organization!)).members,
    staleTime: 30_000,
    retry: false,
  });
  return readOf(enabled, query);
}

/**
 * `list_organization_connectors` of an organization, by its name: its own
 * connectors
 * (`organizationOwnConnectors`, which leaves out the agents' muster bindings
 * by what this installation's agent-manager can say), with the ones in
 * `picked` whatever they are. Waits for `get_info`, whose version decides
 * the rule; a `get_info` that fails leaves the older rule.
 */
export function useOrganizationConnectors(
  installation: string,
  organization: string | undefined,
  picked: readonly string[] = [],
): OrganizationRead<OrganizationConnector[]> {
  const client = useAgentManagerClient(installation);
  const infoRead = useAgentManagerInfo(installation);
  const enabled = Boolean(client) && Boolean(organization);
  const query = useQuery({
    queryKey: musterOrganizationConnectorsQueryKey(
      installation,
      organization ?? '',
    ),
    enabled,
    queryFn: () => client!.listOrganizationConnectors(organization!),
    staleTime: 60_000,
    retry: false,
  });
  const read = readOf(enabled, query);
  const infoPending = !infoRead.info && infoRead.isLoading;
  return {
    ...read,
    data:
      read.data && !infoPending
        ? organizationOwnConnectors(read.data, infoRead.info?.version, picked)
        : undefined,
    isLoading: read.isLoading || (enabled && infoPending),
  };
}

/** A member's kind as the events report it. */
function memberKind(request: MemberRequest): 'group' | 'person' {
  return request.group ? 'group' : 'person';
}

/**
 * Adding and removing the members of the organization in `namespace`, by
 * its name, as the person (`add_organization_member`,
 * `remove_organization_member`). A refusal is
 * agent-manager's, in its own words: the page shows it as it comes, the
 * removal of `organization-admins`' last admin among them. The mode follows
 * the organization ({@link useOrganizationContentMode}): in mode commit the
 * answer carries the pull request (`commit`) and nothing is bound yet.
 */
export function useOrganizationMemberWrites(
  installation: string,
  organization: OrganizationNamespace,
) {
  const client = useAgentManagerClient(installation);
  const contentMode = useOrganizationContentMode();
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: musterOrganizationMembersQueryKey(
        installation,
        organization.organization,
      ),
    });

  const add = useTrackedMutation<MemberResult, Error, MemberRequest>({
    // A pull request adds no one until it is merged.
    event: (result, request) =>
      result.changed && !result.commit
        ? {
            name: 'AgentPlatform.organizationMemberAdded',
            attributes: {
              kind: memberKind(request),
              role: request.role ?? 'user',
            },
          }
        : null,
    mutationFn: async request => {
      if (!client) {
        throw new Error('agent-manager is not reachable on this installation.');
      }
      return client.addOrganizationMember({
        ...request,
        ...modeArgument(
          await contentMode(installation, organization.namespace),
        ),
      });
    },
    onSuccess: refresh,
  });

  const remove = useTrackedMutation<MemberResult, Error, MemberRequest>({
    event: (result, request) =>
      result.changed && !result.commit
        ? {
            name: 'AgentPlatform.organizationMemberRemoved',
            attributes: { kind: memberKind(request) },
          }
        : null,
    mutationFn: async request => {
      if (!client) {
        throw new Error('agent-manager is not reachable on this installation.');
      }
      return client.removeOrganizationMember({
        ...request,
        ...modeArgument(
          await contentMode(installation, organization.namespace),
        ),
      });
    },
    onSuccess: refresh,
  });

  return { add, remove };
}

/**
 * `get_organization` read afresh, for the delete dialog: what a delete
 * erases now, and the running sessions it stops. Mounted only while the
 * dialog is open, so every opening asks again. It is kept under its own key
 * and dropped once the dialog closes: in the page's `get_organization` key
 * it would hide a newer status from `list_organizations`.
 */
export function useOrganizationErasure(
  installation: string,
  name: string,
): OrganizationRead<OrganizationDetails> {
  const client = useAgentManagerClient(installation);
  const enabled = Boolean(client);
  const query = useQuery({
    queryKey: musterOrganizationErasureQueryKey(installation, name),
    enabled,
    queryFn: () => client!.getOrganization(name),
    refetchOnMount: 'always',
    gcTime: 0,
    retry: false,
  });
  return {
    data: query.isFetching ? undefined : query.data,
    isLoading: enabled && (query.isFetching || isAwaitingData(query)),
    failure: query.error ? classifyReadFailure(query.error) : undefined,
  };
}

/**
 * Deletes an organization as the person (`delete_organization`): a pull
 * request for one applied from git, the erasure with the typed name
 * otherwise or once that pull request merged. agent-manager checks the
 * name again; its refusal is the mutation's error, in its own words.
 */
export function useOrganizationDeletion(installation: string, name: string) {
  const client = useAgentManagerClient(installation);
  const queryClient = useQueryClient();
  return useTrackedMutation<
    OrganizationDeleteResult,
    Error,
    { mode: OrganizationDeleteMode; confirm?: string }
  >({
    event: (result, { mode }) => {
      if (mode === 'pull-request') {
        return result.commit?.pullRequest
          ? {
              name: 'AgentPlatform.organizationDeleteRequested',
              attributes: {},
            }
          : null;
      }
      return result.deleted
        ? { name: 'AgentPlatform.organizationErased', attributes: {} }
        : null;
    },
    mutationFn: ({ mode, confirm }) => {
      if (!client) {
        throw new Error('agent-manager is not reachable on this installation.');
      }
      return client.deleteOrganization({
        name,
        ...(mode === 'pull-request' ? {} : { confirm }),
        ...(mode === 'delete' ? {} : { mode: 'commit' as const }),
      });
    },
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: musterOrganizationQueryKey(installation, name),
        }),
        queryClient.invalidateQueries({
          queryKey: musterOrganizationsQueryKey(installation),
        }),
      ]),
  });
}

/**
 * The listing with a new organization in it, as `create_organization`
 * answered it, unless the listing has it already: agent-manager may list it
 * only on a later read. The person who created it manages it.
 */
function withCreated(
  listing: OrganizationListing | undefined,
  created: OrganizationCreateResult['organization'],
): OrganizationListing | undefined {
  if (
    !listing ||
    listing.organizations.some(listed => listed.name === created.name)
  ) {
    return listing;
  }
  const organization: ListedOrganization = {
    name: created.name,
    ...(created.displayName ? { displayName: created.displayName } : {}),
    ...(created.namespace ? { namespace: created.namespace } : {}),
    permissions: { manage: true, member: false },
    organization: created,
  };
  return {
    ...listing,
    organizations: [...listing.organizations, organization],
  };
}

/**
 * Creates an organization as the person (`create_organization`): one
 * `Organization` with the Agent Platform on and its admins. agent-manager
 * does not wait for the operator, so the new organization goes into the
 * listing at once, not ready, and the listing is read until it is.
 */
export function useOrganizationCreation(installation: string | undefined) {
  const client = useAgentManagerClient(installation);
  const queryClient = useQueryClient();
  return useTrackedMutation<
    OrganizationCreateResult,
    Error,
    OrganizationCreateRequest
  >({
    event: result =>
      result.created
        ? { name: 'AgentPlatform.organizationCreated', attributes: {} }
        : null,
    mutationFn: request => {
      if (!client || !installation) {
        throw new Error('agent-manager is not reachable on this installation.');
      }
      return client.createOrganization(request);
    },
    onSuccess: async result => {
      if (!installation || !result.created) {
        return;
      }
      const key = musterOrganizationsQueryKey(installation);
      await queryClient.cancelQueries({ queryKey: key });
      queryClient.setQueryData<OrganizationListing>(key, listing =>
        withCreated(listing, result.organization),
      );
    },
  });
}

/**
 * Changes an organization's admins as the person (`update_organization`'s
 * `adminGroups` and `adminUsers`): each kind replaces that kind of
 * `spec.admins`. An organization applied from git is changed by pull
 * request where agent-manager opens them, as its content is
 * ({@link organizationContentMode}).
 */
export function useOrganizationAdminsUpdate(
  installation: string,
  name: string,
) {
  const client = useAgentManagerClient(installation);
  const info = useAgentManagerInfo(installation);
  const queryClient = useQueryClient();
  return useTrackedMutation<
    OrganizationUpdateResult,
    Error,
    OrganizationAdmins & { organization: ListedOrganization | undefined }
  >({
    event: result =>
      result.commit
        ? null
        : { name: 'AgentPlatform.organizationAdminsChanged', attributes: {} },
    mutationFn: ({ organization, adminGroups, adminUsers }) => {
      if (!client) {
        throw new Error('agent-manager is not reachable on this installation.');
      }
      const mode = organizationContentMode(
        organization,
        info.info?.capabilities?.commit === true,
      );
      return client.updateOrganizationAdmins({
        name,
        adminGroups,
        adminUsers,
        ...modeArgument(mode),
      });
    },
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: musterOrganizationsQueryKey(installation),
        }),
        queryClient.invalidateQueries({
          queryKey: musterOrganizationQueryKey(installation, name),
        }),
        queryClient.invalidateQueries({
          queryKey: musterOrganizationMembersQueryKey(installation, name),
        }),
      ]),
  });
}
