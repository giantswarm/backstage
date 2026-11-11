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
 * An organization namespace as its labels describe it: what the directory
 * names a namespace by.
 */
export type OrganizationNamespace = {
  /** The organization namespace, e.g. `agents-payments-x7k2q`. */
  namespace: string;
  /** The organization's name (`agent-platform.giantswarm.io/organization`). */
  organization: string;
  /** The parent namespace it lives in (`agent-platform.giantswarm.io/parent`). */
  parent: string;
};

/** A condition of the organization as the operator reports it. */
export type OrganizationCondition = {
  status: string;
  reason?: string;
  message?: string;
};

/**
 * The operator's reason for `orphaned` `True` once the organization's delete
 * pull request merged; any other is Missing from git.
 */
export const ORPHANED_DELETE_MERGED = 'DeleteMerged';

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
  /** The step of the erasure the operator is on, while `deleting`. */
  erasureStep?: string;
  /**
   * The Flux Kustomization that applies the organization: it is changed in
   * git, so a delete is a pull request.
   */
  gitops?: string;
};

/** One agent's sessions an erase deletes. */
export type OrganizationAgentSessions = {
  agent: string;
  /** CREATING or READY: they stop. */
  running: number;
  /** SUSPENDED or FAILED: they lose their worker snapshots. */
  stopped: number;
};

/**
 * What deleting an organization erases, as the person can read it in the
 * organization namespace (`get_organization`'s `erases`).
 */
export type OrganizationErasure = {
  namespace: string;
  agents: string[];
  helmReleases: string[];
  models: string[];
  connectors: string[];
  egressPolicies: string[];
  /** The credential Secrets the models, connectors and policies name. */
  credentials: string[];
  /** The RoleBindings to the organization's roles. */
  members: string[];
  snapshotPrefix?: string;
  /** Only agents with a session; `null` when they could not be listed. */
  sessions: OrganizationAgentSessions[] | null;
  /** Why `sessions` is `null`. */
  sessionsUnavailable?: string;
  /** What a delete does not erase. */
  kept: string;
  /** What the person may not read there, with why. */
  unreadable?: string[];
};

/** The pull request a delete in mode commit opened. */
export type OrganizationCommit = {
  repository: string;
  base: string;
  branch: string;
  pullRequest?: string;
  number?: number;
  author?: string;
  /** Who reviews it. */
  review?: string;
  /** What the merge alone does not do. */
  liveSteps?: string[];
  /** git carries the delete already: no pull request was opened. */
  unchanged?: boolean;
};

/** `delete_organization`'s answer. */
export type OrganizationDeleteResult = {
  organization: AgentPlatformOrganization;
  erases?: OrganizationErasure;
  deleted: boolean;
  next?: string;
  commit?: OrganizationCommit;
};

/** What a delete of an organization does, from its own state. */
export type OrganizationDeleteMode =
  /** Deleted live: the operator erases it. */
  | 'delete'
  /** Applied from git: a pull request removes its file. */
  | 'pull-request'
  /** Its delete pull request merged (Pending erase): erased now. */
  | 'erase';

/**
 * The delete an organization offers, or none: none while it is erasing or
 * Missing from git.
 */
export function organizationDeleteMode(
  organization: Pick<
    AgentPlatformOrganization,
    'deleting' | 'orphaned' | 'gitops'
  >,
): OrganizationDeleteMode | undefined {
  if (organization.deleting) {
    return undefined;
  }
  if (organization.orphaned?.status === 'True') {
    return organization.orphaned.reason === ORPHANED_DELETE_MERGED
      ? 'erase'
      : undefined;
  }
  return organization.gitops ? 'pull-request' : 'delete';
}

/**
 * What the person may do with a listed organization, as the API server
 * answers agent-manager's access reviews with the person's token.
 */
export type OrganizationPermissions = {
  /**
   * `update` on the AgentPlatformOrganization in its parent namespace
   * (agent-platform:organizations-admin): reading it whole, deleting and
   * erasing it.
   */
  manage: boolean;
  /** `list` on Agents in the organization namespace: a member of any role. */
  member: boolean;
};

/**
 * One organization of `list_organizations`. A member who does not manage it
 * gets its status only; one who manages it also gets `organization`, the
 * object `get_organization` answers.
 */
export type ListedOrganization = {
  name: string;
  parent: string;
  displayName?: string;
  /** The organization namespace, once the operator created it. */
  namespace?: string;
  orphaned?: OrganizationCondition;
  deleting?: boolean;
  permissions: OrganizationPermissions;
  organization?: AgentPlatformOrganization;
};

/** `list_organizations`: the organizations the person manages or belongs to. */
export type OrganizationListing = {
  organizations: ListedOrganization[];
  /** Who can add the person, when they manage and belong to none. */
  none?: string;
};

/** The listed organizations that have a namespace, as the directory names them. */
export function organizationNamespacesOf(
  answer: OrganizationListing | undefined,
): OrganizationNamespace[] {
  return (answer?.organizations ?? []).flatMap(organization =>
    organization.namespace
      ? [
          {
            namespace: organization.namespace,
            organization: organization.name,
            parent: organization.parent,
          },
        ]
      : [],
  );
}

/** What the status notices of an organization read. */
export type OrganizationStatus = Pick<
  AgentPlatformOrganization,
  | 'deleting'
  | 'erasureStep'
  | 'orphaned'
  | 'lastAppliedRevision'
  | 'lastAppliedRevisionUrl'
>;

/** `get_organization`: the organization, and what a delete would erase. */
export type OrganizationDetails = {
  organization: AgentPlatformOrganization;
  /** Absent until the operator created the organization namespace. */
  erases?: OrganizationErasure;
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

/**
 * `set_organization_model` without a key: a new model of the organization,
 * or `replaceCredential` on an existing one. A missing or replaced key is a
 * credential request agent-manager prepares and links to the form.
 */
export type OrganizationModelRequest = {
  namespace: string;
  name: string;
  provider?: string;
  model?: string;
  replaceCredential?: boolean;
  /** Idempotency key: one per intended change. */
  requestId: string;
};

/** `set_organization_connector` with `replaceCredential`: a new credential value for an existing connector. */
export type OrganizationConnectorCredentialRequest = {
  namespace: string;
  name: string;
  replaceCredential: true;
  requestId: string;
};
