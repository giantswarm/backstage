/**
 * Agent Platform organizations, as agent-manager's organization tools answer
 * them (giantswarm/giantswarm#39492).
 *
 * An organization is an `Organization` (`security.giantswarm.io`,
 * cluster-scoped) with the Agent Platform enabled, identified by its name
 * alone. agent-platform-operator keeps its organization namespace and
 * reports it in the object's status; its admins are the object's
 * `spec.admins`. The portal learns which namespace is which organization
 * only from agent-manager's answers: a namespace's name is never parsed or
 * computed.
 */

import { listOf } from './listOf';

/** `get_info`'s capability for the organization tools. */
export const ORGANIZATIONS_CAPABILITY = 'organizations';

/**
 * An organization namespace as its labels describe it: what the directory
 * names a namespace by.
 */
export type OrganizationNamespace = {
  /** The organization namespace, e.g. `agents-payments-x7k2q`. */
  namespace: string;
  /** The organization's name: the name of its `Organization`. */
  organization: string;
  /** The display name, if set. */
  displayName?: string;
};

/** A group or a person, as a RoleBinding or `spec.admins` names them. */
export type OrganizationSubject = {
  /** `Group` or `User`. */
  kind: string;
  name: string;
  namespace?: string;
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

/** `get_organization`'s organization: the summary of its `Organization`. */
export type OrganizationSummary = {
  name: string;
  displayName?: string;
  /** The organization namespace, once the operator reported it. */
  namespace?: string;
  /**
   * `spec.admins`: the groups and people the organization is handed to,
   * whom the operator binds to `agent-platform:admin` in its namespace.
   * Absent from an answer that predates the field.
   */
  admins?: OrganizationSubject[];
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
  /**
   * organization-operator's namespace of the `Organization` (`org-<name>`),
   * on an installation where it runs: it goes with the organization.
   */
  organizationNamespace?: string;
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
  organization: OrganizationSummary;
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
  organization: Pick<OrganizationSummary, 'deleting' | 'orphaned' | 'gitops'>,
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
 * Whether Flux applies the organization from the installation's git
 * repository. A person who manages it reads `gitops`; a member reads only
 * its status, where the operator's `orphaned` condition says the same: the
 * operator sets it, in any state, on an organization of the installation's
 * Kustomization only.
 */
export function isAppliedFromGit(
  organization: Pick<ListedOrganization, 'orphaned' | 'organization'>,
): boolean {
  return (
    Boolean(organization.organization?.gitops) ||
    organization.orphaned !== undefined
  );
}

/**
 * How the portal writes an organization's content (its models, connectors,
 * egress policies, members and credentials): by pull request for an
 * organization applied from git on an installation whose agent-manager opens
 * pull requests, live otherwise. The person gets no choice: the portal keeps
 * an organization's content where the organization itself is. agent-manager
 * still decides for an object that exists by how that object is applied, and
 * refuses the other mode (`gitops_owned`, `conflict`).
 */
export function organizationContentMode(
  organization:
    Pick<ListedOrganization, 'orphaned' | 'organization'> | undefined,
  commitMode: boolean,
): OrganizationWriteMode {
  return commitMode && organization && isAppliedFromGit(organization)
    ? 'commit'
    : 'apply';
}

/**
 * Why a content write in `namespace` is refused on an installation with
 * commit mode: `list_organizations` does not name its organization, so
 * whether it is applied from git is not known.
 */
export function organizationModeUnknown(namespace: string): string {
  return `Could not tell whether the organization of ${namespace} is applied from git, so nothing was written. Read the page again, then try again.`;
}

/** What a content write's pull request does once merged. */
export const CONTENT_PULL_REQUEST_NEXT =
  'The change applies once the pull request is merged.';

/** Why a content write in mode commit opened no pull request. */
export const CONTENT_PULL_REQUEST_UNCHANGED = 'git already holds this change.';

/** How a write of an organization's content goes: live or by pull request. */
export type OrganizationWriteMode = 'apply' | 'commit';

/**
 * The `mode` argument of a content write: only `commit` is sent, so a live
 * write stays the call it was.
 */
export function modeArgument(mode: OrganizationWriteMode | undefined): {
  mode?: 'commit';
} {
  return mode === 'commit' ? { mode } : {};
}

/**
 * What the person may do with a listed organization, as the API server
 * answers agent-manager's access reviews with the person's token.
 */
export type OrganizationPermissions = {
  /**
   * `update` on the cluster-scoped `Organization`
   * (agent-platform:organizations-admin): reading it whole, changing its
   * admins, deleting and erasing it.
   */
  manage: boolean;
  /** `list` on Agents in the organization namespace: a member of any role. */
  member: boolean;
  /**
   * `create` on Agents in the organization namespace: an editor or an admin,
   * not a user. Absent from an agent-manager older than the field, where it
   * is not known: never read a missing one as `false`
   * ({@link mayCreateAgentsIn}).
   */
  createAgents?: boolean;
};

/**
 * Whether the New agent form lets the person pick an organization they
 * belong to: unless agent-manager says they may not create agents in it. An
 * agent-manager that does not say keeps it selectable, and the create call
 * gets its own answer.
 */
export function mayCreateAgentsIn(
  organization: Pick<ListedOrganization, 'permissions'>,
): boolean {
  return organization.permissions.createAgents !== false;
}

/**
 * Why the New agent form does not let the person pick an organization they
 * belong to, beside it: `agent-platform:user` uses agents, an editor (or an
 * admin) creates them.
 */
export const CREATE_AGENTS_ROLE_REASON =
  'Needs the editor role to create agents.';

/**
 * Under the Organization picker, while it holds organizations it does not
 * let the person pick: which ones, and why, without opening the list (a
 * keyboard skips the disabled options).
 */
export function createAgentsBlockedIn(organizations: string[]): string {
  return `You may not create agents in ${listOf(organizations)}: you need the editor role there.`;
}

/**
 * The New agent form's problem when the organization it holds is one the
 * person may not create agents in (as a draft brought it back).
 */
export function createAgentsRefusedIn(organization: string): string {
  return `You may not create agents in ${organization}: you need the editor role there. Choose another organization, or ask an admin of ${organization} for it.`;
}

/**
 * The New agent form's problem when the person belongs to organizations on
 * an environment but may create agents in none of them.
 */
export function createAgentsRefusedOn(installation: string): string {
  return `You may not create agents in your organizations on ${installation}: that needs the editor role in an organization. Choose another environment, or ask an admin of your organization for the editor role.`;
}

/**
 * One organization of `list_organizations`. A member who does not manage it
 * gets its status only; one who manages it also gets `organization`, the
 * object `get_organization` answers.
 */
export type ListedOrganization = {
  name: string;
  displayName?: string;
  /** The organization namespace, once the operator created it. */
  namespace?: string;
  orphaned?: OrganizationCondition;
  deleting?: boolean;
  permissions: OrganizationPermissions;
  organization?: OrganizationSummary;
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
            ...(organization.displayName
              ? { displayName: organization.displayName }
              : {}),
          },
        ]
      : [],
  );
}

/**
 * The reads that tell which organization a namespace is: `get_info`, whose
 * capability says whether the installation serves organizations, and
 * `list_organizations`.
 */
export type OrganizationReads = {
  info: () => Promise<{ capabilities?: Record<string, boolean> }>;
  listing: () => Promise<OrganizationListing>;
};

/**
 * The name of the organization whose namespace `namespace` is, as
 * `list_organizations` names it: agent-manager's tools take an organization
 * by its name, never by its namespace. None where the installation serves no
 * organizations or the listing names no organization with that namespace.
 */
export async function organizationOfNamespace(
  namespace: string,
  reads: OrganizationReads,
): Promise<string | undefined> {
  const info = await reads.info();
  if (info.capabilities?.[ORGANIZATIONS_CAPABILITY] !== true) {
    return undefined;
  }
  const listing = await reads.listing();
  return listing.organizations.find(listed => listed.namespace === namespace)
    ?.name;
}

/**
 * Why a model write in `namespace` is refused: the namespace is neither the
 * installation's models' nor that of an organization the person belongs to,
 * and agent-manager's model tools take only those, the organization by its
 * name.
 */
export function modelNamespaceRefused(namespace: string): string {
  return `${namespace} is neither the installation's models namespace nor the namespace of an organization you belong to, so nothing was written.`;
}

/** What the status notices of an organization read. */
export type OrganizationStatus = Pick<
  OrganizationSummary,
  | 'deleting'
  | 'erasureStep'
  | 'orphaned'
  | 'lastAppliedRevision'
  | 'lastAppliedRevisionUrl'
>;

/** `get_organization`: the organization, and what a delete would erase. */
export type OrganizationDetails = {
  organization: OrganizationSummary;
  /** Absent until the operator created the organization namespace. */
  erases?: OrganizationErasure;
};

/** The roles of an organization, as the member list shows them. */
export const MEMBER_ROLES = ['admin', 'editor', 'user'] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

/**
 * The roles the member tools give and take: never admin. The admins are
 * the `Organization`'s `spec.admins`, changed with `update_organization`.
 */
export const MEMBER_FORM_ROLES = ['editor', 'user'] as const;
export type MemberFormRole = (typeof MEMBER_FORM_ROLES)[number];

/** What each role may do, in the words of agent-manager's tool schema. */
export const MEMBER_ROLE_DESCRIPTIONS: Record<MemberRole, string> = {
  admin: 'manages members, models and credentials',
  editor: 'creates agents',
  user: 'uses them',
};

/**
 * The RoleBinding agent-platform-operator writes from the `Organization`'s
 * `spec.admins`: the member tools do not change it.
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
  /**
   * Where an admin comes from: the `Organization`'s `spec.admins`, in
   * agent-manager's words. Absent on every other member.
   */
  from?: string;
};

export type OrganizationMembers = {
  /** The organization, as agent-manager answered it. */
  organization: string;
  members: OrganizationMember[];
};

/** A group or a person to add or remove (`add_organization_member`). */
export type MemberRequest = {
  /** The organization's name: the name of its `Organization`. */
  organization: string;
  role?: MemberFormRole;
  /** A pull request instead of a live write ({@link organizationContentMode}). */
  mode?: 'commit';
} & ({ group: string; user?: never } | { user: string; group?: never });

/** `add_organization_member` and `remove_organization_member`. */
export type MemberResult = {
  /** The organization, as agent-manager answered it. */
  organization?: string;
  /** Its namespace, a detail. */
  namespace?: string;
  member: OrganizationMember;
  changed: boolean;
  bindings?: string[];
  /** The pull request of a change in mode commit. */
  commit?: OrganizationCommit;
  /** What a remove left as it was: an admin role, which the object holds. */
  note?: string;
};

/** An organization's admins by kind, as the create and update tools take them. */
export type OrganizationAdmins = {
  /** Identity provider groups, as the API server sees them. */
  adminGroups: string[];
  /** People, as the API server sees them. */
  adminUsers: string[];
};

/** `spec.admins` split by kind; another kind of subject is left out. */
export function adminsOf(
  subjects: readonly OrganizationSubject[] | undefined,
): OrganizationAdmins {
  const of = (kind: string) =>
    (subjects ?? [])
      .filter(subject => subject.kind === kind)
      .map(subject => subject.name);
  return { adminGroups: of('Group'), adminUsers: of('User') };
}

/**
 * Names typed one per line: each trimmed, the empty lines and the repeats
 * left out, in the order typed.
 */
export function namesPerLine(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean),
    ),
  ];
}

/** `create_organization`: an `Organization` with the Agent Platform on. */
export type OrganizationCreateRequest = {
  name: string;
  displayName?: string;
} & Partial<OrganizationAdmins>;

/**
 * `create_organization`'s answer. agent-manager writes the object and does
 * not wait for the operator: `next` says what the operator does next.
 */
export type OrganizationCreateResult = {
  organization: OrganizationSummary;
  created: boolean;
  next?: string;
  /** The pull request of a create in mode commit. */
  commit?: OrganizationCommit;
};

/**
 * `update_organization` of the admins: each kind given replaces that kind
 * of `spec.admins`; `[]` removes them.
 */
export type OrganizationAdminsUpdate = {
  name: string;
  /** A pull request for an organization applied from git. */
  mode?: 'commit';
} & Partial<OrganizationAdmins>;

/** `update_organization`'s answer. */
export type OrganizationUpdateResult = {
  before?: OrganizationSummary;
  after?: OrganizationSummary;
  changed?: string[];
  commit?: OrganizationCommit;
};

/**
 * An organization's name, as `create_organization` takes it: the name of
 * its `Organization`, at most 56 characters, a DNS label. agent-manager
 * checks it again.
 */
export const ORGANIZATION_NAME_MAX_LENGTH = 56;

/** Why `name` cannot name a new organization; `undefined` when it can. */
export function organizationNameProblem(name: string): string | undefined {
  if (!name) {
    return 'Enter a name for the organization.';
  }
  if (name.length > ORGANIZATION_NAME_MAX_LENGTH) {
    return `Use at most ${ORGANIZATION_NAME_MAX_LENGTH} characters.`;
  }
  if (!/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(name)) {
    return 'Use lowercase letters, digits and hyphens, starting and ending with a letter or a digit, e.g. payments.';
  }
  return undefined;
}

/**
 * Whether the operator reports the organization ready: it has its
 * namespace, and its `Ready` condition, where the person reads it, is not
 * `False`. A member reads no condition: the namespace says it there.
 */
export function isOrganizationReady(
  organization: Pick<ListedOrganization, 'namespace' | 'organization'>,
): boolean {
  return (
    Boolean(organization.namespace) &&
    organization.organization?.ready?.status !== 'False'
  );
}

/**
 * Whether a credential's Secret exists, as agent-manager 3.3 and later ask it
 * as the caller: `unknown` when the caller may not ask (an editor of the
 * organization). Absent from an older agent-manager.
 */
export type ConnectorCredentialState = 'present' | 'missing' | 'unknown';

/** One Secret-backed header of a connector. */
export type ConnectorCredential = {
  header: string;
  secret: string;
  key: string;
  state?: ConnectorCredentialState;
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
  /**
   * The agent whose muster binding this RemoteMCPServer is (the agent chart
   * renders one for each agent): no connector. Absent on every other one,
   * for a caller who may not list the namespace's Agents, and from an
   * agent-manager older than 3.3.4 (`organizationOwnConnectors`).
   */
  musterBindingOf?: string;
  /**
   * kagent's `Accepted` condition of the current generation (its tool
   * discovery), with its reason and message; `null` while unreported.
   * Absent from an agent-manager older than 3.3.
   */
  accepted?: boolean | null;
  reason?: string;
  message?: string;
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
 * or a change of an existing one (an empty field keeps its value). A missing
 * key is a credential request agent-manager prepares and links to the form;
 * a new key for an existing model is `replace_organization_credential`.
 */
export type OrganizationModelRequest = {
  projectID?: string;
  location?: string;
  endpoint?: string;
  displayName?: string;
  insecureSkipTLSVerify?: boolean;
  noCredential?: boolean;
  create?: boolean;
  /**
   * The model's namespace: the installation's models' or an organization's.
   * The client sends the organization by its name, or none for the
   * installation's models.
   */
  namespace: string;
  /** The organization of `namespace`, by its name, when the caller knows it. */
  organization?: string;
  name: string;
  provider?: string;
  model?: string;
  /** Moves the organization's default mark to this model. */
  default?: boolean;
  /**
   * The token limit of an answer; `0` removes it. Sent only where the tool
   * takes it (`takesModelSettings`), as are the two below.
   */
  maxTokens?: number;
  /** Prompt caching (Anthropic); a new Anthropic model has it on. */
  promptCaching?: boolean;
  /** How long a cached prompt stays: `5m` or `1h`. */
  cacheTTL?: string;
  /** Idempotency key: one per intended change. */
  requestId: string;
  /** A pull request instead of a live write ({@link organizationContentMode}). */
  mode?: 'commit';
};

/**
 * `replace_organization_credential`: a new value for one key of a credential
 * Secret of the organization. The operation writes the Secret only, never
 * the models, connectors or egress policies that read it.
 */
export type OrganizationCredentialReplacement = {
  /** As {@link OrganizationModelRequest}'s `namespace` and `organization`. */
  namespace: string;
  organization?: string;
  /** The credential Secret, by name. */
  secret: string;
  /** The key of that Secret the objects read. */
  key: string;
  /** Idempotency key: one per intended change. */
  requestId: string;
  /** A pull request instead of a live write ({@link organizationContentMode}). */
  mode?: 'commit';
};

/**
 * The `set_organization_model` arguments the portal's model forms send; an
 * agent-manager whose tool lacks one of them predates model credential
 * operations.
 */
export const MODEL_OPERATION_FIELDS = [
  'projectID',
  'location',
  'endpoint',
  'displayName',
  'noCredential',
] as const;

/** Whether a `set_organization_model` input schema takes every model field. */
export function hasModelOperations(
  inputSchema: { properties?: Record<string, unknown> } | undefined,
): boolean {
  const properties = inputSchema?.properties ?? {};
  return MODEL_OPERATION_FIELDS.every(field =>
    Object.hasOwn(properties, field),
  );
}

export const MODEL_OPERATIONS_MISSING =
  'This installation needs an agent-manager release with model credential operations. No model was written.';

/**
 * Whether a `set_organization_model` input schema takes `create`: refuse a
 * model of that name, live or in git, with `already_exists` instead of
 * changing it. agent-manager 2.24.0 and older lack it and refuse the unknown
 * argument with `invalid_request`. Every release that passes
 * {@link hasModelOperations} (3.1.0 and later) has it; it is still sent only
 * where the tool lists it, so no schema ever gets an argument it lacks.
 */
export function takesCreateOnly(
  inputSchema: { properties?: Record<string, unknown> } | undefined,
): boolean {
  return Object.hasOwn(inputSchema?.properties ?? {}, 'create');
}

/** A new model's name that a model of the namespace has already. */
export function modelNameTakenMessage(namespace: string, name: string): string {
  return `The namespace ${namespace} already has a model named ${name}. Choose another name, or edit that model.`;
}
