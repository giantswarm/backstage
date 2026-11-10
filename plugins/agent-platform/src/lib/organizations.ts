/**
 * Agent Platform organizations, as agent-manager's organization tools answer
 * them (giantswarm/giantswarm#38891).
 *
 * An organization is an `AgentPlatformOrganization` in a parent namespace;
 * agent-platform-operator keeps its organization namespace
 * (`agents-<name>-<random>`), labelled with the organization's name and its
 * parent. The portal learns which namespace is which organization only from
 * agent-manager's answers, which read those labels: a namespace's name is
 * never parsed.
 */

/** `get_info`'s capability for the organization tools. */
export const ORGANIZATIONS_CAPABILITY = 'organizations';

/**
 * An organization namespace as its labels describe it
 * (`list_my_organizations`).
 */
export type OrganizationNamespace = {
  /** The organization namespace, e.g. `agents-payments-x7k2q`. */
  namespace: string;
  /** The organization's name (`agent-platform.giantswarm.io/organization`). */
  organization: string;
  /** The parent namespace it lives in (`agent-platform.giantswarm.io/parent`). */
  parent: string;
};

/** `list_my_organizations`: the organizations the person belongs to. */
export type MyOrganizations = {
  organizations: OrganizationNamespace[];
  /** Who can add the person, when they belong to none. */
  none?: string;
};

/** A condition of the organization as the operator reports it. */
export type OrganizationCondition = {
  status: string;
  reason?: string;
  message?: string;
};

/** `get_organization`'s organization. */
export type AgentPlatformOrganization = {
  name: string;
  parent: string;
  /** The display name (`agent-platform.giantswarm.io/display-name`). */
  displayName?: string;
  namespace?: string;
  harnesses: string[];
  workerReplicas: number;
  ready?: OrganizationCondition;
  defaultModelConfigured?: OrganizationCondition;
  orphaned?: OrganizationCondition;
  /**
   * The last revision Flux applied the organization from
   * (`<branch>@sha1:<sha>`), kept while it is orphaned.
   */
  lastAppliedRevision?: string;
  /** That revision's commit on GitHub, when agent-manager knows the repository. */
  lastAppliedRevisionUrl?: string;
  deleting?: boolean;
};

/**
 * The operator's reason for `orphaned` `True` once the organization's delete
 * pull request merged; any other is Missing from git.
 */
export const ORPHANED_DELETE_MERGED = 'DeleteMerged';

/** `get_organization`: the organization, and what a delete would erase. */
export type OrganizationDetails = {
  organization: AgentPlatformOrganization;
};

/** The roles of an organization, as the member tools take them. */
export const MEMBER_ROLES = ['admin', 'editor', 'user'] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

/** What each role may do, in the words of agent-manager's tool schema. */
export const MEMBER_ROLE_DESCRIPTIONS: Record<MemberRole, string> = {
  admin: 'manages members, models and credentials',
  editor: 'creates agents',
  user: 'uses them',
};

/**
 * The RoleBinding that holds the first admins. Admission keeps its last admin
 * while the organization lives, so removing that one is refused.
 */
export const FIRST_ADMINS_BINDING = 'organization-admins';

/** One subject bound to an organization role (`list_organization_members`). */
export type OrganizationMember = {
  /** `Group` or `User` (a ServiceAccount is shown as it comes). */
  kind: string;
  name: string;
  namespace?: string;
  role: MemberRole;
  /** The RoleBinding that grants it. */
  binding: string;
};

export type OrganizationMembers = {
  namespace: string;
  members: OrganizationMember[];
};

/** A group or a person to add or remove (`add_organization_member`). */
export type MemberRequest = {
  namespace: string;
  role?: MemberRole;
} & ({ group: string; user?: never } | { user: string; group?: never });

/** `add_organization_member` and `remove_organization_member`. */
export type MemberResult = {
  namespace: string;
  member: OrganizationMember;
  changed: boolean;
  bindings?: string[];
};

/** One Secret-backed header of a connector. */
export type ConnectorCredential = {
  header: string;
  secret: string;
  key: string;
};

/** An organization's connector, a RemoteMCPServer. */
export type OrganizationConnector = {
  name: string;
  url: string;
  description?: string;
  credentials: ConnectorCredential[];
  /** A read-only copy of what the platform curates. */
  curated?: boolean;
  managedBy?: string;
};

/**
 * Which organization each namespace is, by namespace, from the organizations
 * agent-manager answered: the one source of an agent's organization.
 */
export type OrganizationDirectory = ReadonlyMap<string, OrganizationNamespace>;

export const EMPTY_ORGANIZATION_DIRECTORY: OrganizationDirectory = new Map();

/** A directory of `organizations`, by namespace. */
export function organizationDirectory(
  organizations: readonly OrganizationNamespace[],
): OrganizationDirectory {
  return new Map(organizations.map(org => [org.namespace, org]));
}

/** A member's kind as the page says it. */
export function memberKindLabel(kind: string): string {
  switch (kind) {
    case 'Group':
      return 'Group';
    case 'User':
      return 'Person';
    default:
      return kind;
  }
}
