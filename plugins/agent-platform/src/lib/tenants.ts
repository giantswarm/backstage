/**
 * Tenants: who an agent belongs to (giantswarm/giantswarm#36698, D1 and D6).
 *
 * A tenant is a namespace: the installation's `kagent` namespace is the
 * platform tenant, the platform's agents for everyone, and an organization
 * namespace is that organization's tenant. Which namespace is which
 * organization comes only from agent-manager's answers, which read the
 * namespace's `agent-platform.giantswarm.io/organization` and `/parent`
 * labels (an {@link OrganizationDirectory}); a namespace's name is never
 * parsed to decide that (giantswarm/giantswarm#38891), only to name a Giant
 * Swarm organization's `org-<name>` namespace by the organization under
 * "Organization" and in a sentence (`tenantOf`, `tenantInSentence`).
 * Kubernetes RBAC in the
 * namespace decides who sees and changes its agents; the portal only names the
 * tenant. The portal never says "tenant": an agent's tenant is its owner,
 * shown under the label "Owner" as "Platform" (whose agents are available to
 * all organizations) or the organization's name (`ownerOf`). Where a page
 * groups by organization (usage), the platform reads "None" under the label
 * "Organization" instead (`tenantOf`).
 */

import { organizationNameOfNamespace } from '@giantswarm/backstage-plugin-gs-common';
import type {
  OrganizationDirectory,
  OrganizationNamespace,
} from './organizations';

/** The platform tenant's namespace: the installation's `kagent` namespace. */
export const PLATFORM_TENANT_NAMESPACE = 'kagent';

/**
 * Records who created an agent, on its HelmRelease and its `Agent`: written
 * by agent-manager on create (the caller's email), never changed, and for
 * display and filtering only, never an authorization input.
 */
export const CREATED_BY_ANNOTATION = 'agent-platform.giantswarm.io/created-by';

/**
 * The creator's display name from the IdP, beside {@link CREATED_BY_ANNOTATION}
 * (which stays the identifier) and under the same rules: display only.
 */
export const CREATED_BY_NAME_ANNOTATION =
  'agent-platform.giantswarm.io/created-by-name';

/**
 * The organization a namespace is, as agent-manager answered it; none for a
 * namespace the directory does not hold.
 */
export function organizationOf(
  namespace: string,
  directory: OrganizationDirectory,
): OrganizationNamespace | undefined {
  return directory.get(namespace);
}

/** The organization's name a namespace is, if it is one. */
function organizationNameOf(
  namespace: string,
  directory: OrganizationDirectory,
): string | undefined {
  return organizationOf(namespace, directory)?.organization || undefined;
}

/** The label under which an agent's tenant is chosen and shown. */
export const OWNER_LABEL = 'Owner';

/** The platform as an owner, and as the New agent form offers it. */
const PLATFORM_LABEL = 'Platform';

/**
 * What the platform tenant reads as under the label "Organization", where a
 * page groups by organization: the platform is no organization, its agents
 * are available to all of them.
 */
const NO_ORGANIZATION = 'None';

/** Whether a name would read as the platform's `None` under "Organization". */
function readsAsNoOrganization(name: string): boolean {
  return name.toLowerCase() === NO_ORGANIZATION.toLowerCase();
}

/**
 * The organization's name a namespace reads as under "Organization" and in a
 * sentence: the organization agent-manager names it, else the Giant Swarm
 * organization its `org-<name>` namespace names (`org-marian` is `marian`,
 * `organizationNameOfNamespace`). The `org-` reading only names it: which
 * namespace is an Agent Platform organization ({@link tenantKindOf}) still
 * comes from agent-manager's answers alone. A Giant Swarm organization whose
 * name would read as the platform's `None` is left a namespace.
 */
function organizationReadOf(
  namespace: string,
  directory: OrganizationDirectory,
): string | undefined {
  const organization = organizationNameOf(namespace, directory);
  if (organization !== undefined) {
    return organization;
  }
  const giantSwarmOrganization = organizationNameOfNamespace(namespace);
  return giantSwarmOrganization === undefined ||
    readsAsNoOrganization(giantSwarmOrganization)
    ? undefined
    : giantSwarmOrganization;
}

/**
 * The tenant a namespace is, as a value under the label "Organization", one
 * rule for every place that says it (the Usage screen's Organization select,
 * its By organization rows, the sessions list's Organization filter):
 * `None` for the platform tenant, which is no organization; the
 * organization's name for an organization namespace, and for a Giant Swarm
 * organization's `org-<name>` namespace; any other namespace as it is. A name
 * that would read as the platform's keeps a qualifier
 * (`organization none`, `namespace none`; `org-none` keeps its prefix), so the two
 * never sit side by side as one word. Two namespaces can still read the same
 * (`org-team-x` and `team-x`): {@link namespacesSharingAName} finds them, so
 * a list can tell them apart by their namespace.
 */
export function tenantOf(
  namespace: string,
  directory: OrganizationDirectory,
): string {
  if (namespace === PLATFORM_TENANT_NAMESPACE) {
    return NO_ORGANIZATION;
  }
  const organization = organizationReadOf(namespace, directory);
  if (organization !== undefined) {
    return readsAsNoOrganization(organization)
      ? `organization ${organization}`
      : organization;
  }
  return readsAsNoOrganization(namespace)
    ? `namespace ${namespace}`
    : namespace;
}

/**
 * The namespaces of `namespaces` that read the same as another one under
 * "Organization" ({@link tenantOf}, ignoring case): `org-acme` beside the
 * organization acme, `org-team-x` beside `team-x`. A list names these by
 * their namespace too, so the two never look like one.
 */
export function namespacesSharingAName(
  namespaces: Iterable<string>,
  directory: OrganizationDirectory,
): Set<string> {
  const byName = new Map<string, string[]>();
  for (const namespace of new Set(namespaces)) {
    const name = tenantOf(namespace, directory).toLowerCase();
    byName.set(name, [...(byName.get(name) ?? []), namespace]);
  }
  return new Set([...byName.values()].filter(group => group.length > 1).flat());
}

/**
 * The tenant a namespace is, as a value under the label "Owner": `Platform`
 * for the platform tenant (`OwnerValue` says beside it that its agents are
 * available to all organizations), the organization's plain name for an
 * organization namespace, and `namespace <name>` for any other
 * namespace agents live in. An organization whose plain name would read as
 * the platform keeps its qualifier (`organization platform`).
 */
export function ownerOf(
  namespace: string,
  directory: OrganizationDirectory,
): string {
  if (namespace === PLATFORM_TENANT_NAMESPACE) {
    return PLATFORM_LABEL;
  }
  const organization = organizationNameOf(namespace, directory);
  if (organization === undefined) {
    return `namespace ${namespace}`;
  }
  return organization.toLowerCase() === PLATFORM_LABEL.toLowerCase()
    ? `organization ${organization}`
    : organization;
}

/**
 * {@link ownerOf} with an organization's display name where it has one
 * ("Lab" for `default`), as a person reads it.
 */
export function ownerDisplayOf(
  namespace: string,
  directory: OrganizationDirectory,
): string {
  return (
    organizationOf(namespace, directory)?.displayName ||
    ownerOf(namespace, directory)
  );
}

/**
 * The three kinds of place a new agent can be created in: the platform, an
 * organization, or another namespace agent-manager manages that is no
 * organization.
 */
export type TenantKind = 'platform' | 'organization' | 'namespace';

/** Each kind as the New agent form offers it. */
export const TENANT_KIND_LABELS: Record<TenantKind, string> = {
  platform: PLATFORM_LABEL,
  organization: 'Organization',
  namespace: 'Other namespace',
};

/**
 * Who an agent's creator reads as: the recorded name, else the recorded
 * email, else, outside an organization, the platform — such an agent was put there by GitOps
 * automation (the meta agents), and is the platform's to maintain. An
 * organization's agent without the annotation names no creator.
 */
export function creatorOf(
  createdBy: string | undefined,
  kind: TenantKind,
  createdByName?: string,
): string | undefined {
  if (createdByName || createdBy) {
    return createdByName || createdBy;
  }
  return kind === 'organization' ? undefined : PLATFORM_LABEL;
}

/** The kind of place a namespace is. */
export function tenantKindOf(
  namespace: string,
  directory: OrganizationDirectory,
): TenantKind {
  if (namespace === PLATFORM_TENANT_NAMESPACE) {
    return 'platform';
  }
  return organizationOf(namespace, directory) === undefined
    ? 'namespace'
    : 'organization';
}

/**
 * The namespaces of `choices` by their kind, and the kinds present, in the
 * order the form offers them: Platform, Organization, Other namespace.
 */
export function tenantGroups(
  choices: readonly string[],
  directory: OrganizationDirectory,
): {
  kinds: TenantKind[];
  byKind: Record<TenantKind, string[]>;
} {
  const byKind: Record<TenantKind, string[]> = {
    platform: [],
    organization: [],
    namespace: [],
  };
  for (const namespace of choices) {
    byKind[tenantKindOf(namespace, directory)].push(namespace);
  }
  const kinds = (['platform', 'organization', 'namespace'] as const).filter(
    kind => byKind[kind].length > 0,
  );
  return { kinds, byKind };
}

/**
 * The place a new agent's form picks among `choices`: the platform where it
 * is one, else the first in the order the form offers them (the
 * organizations, then the other namespaces).
 */
export function defaultTenant(
  choices: readonly string[],
  directory: OrganizationDirectory,
): string | undefined {
  const { kinds, byKind } = tenantGroups(choices, directory);
  return kinds.length > 0 ? byKind[kinds[0]][0] : undefined;
}

/**
 * The tenant a namespace is, inside a sentence: `the platform`, `the <name>
 * organization` for an organization and for a Giant Swarm organization's
 * `org-<name>` namespace (as {@link tenantOf} names them), or
 * `namespace <name>`.
 */
export function tenantInSentence(
  namespace: string,
  directory: OrganizationDirectory,
): string {
  if (namespace === PLATFORM_TENANT_NAMESPACE) {
    return 'the platform';
  }
  const organization = organizationReadOf(namespace, directory);
  return organization
    ? `the ${organization} organization`
    : `namespace ${namespace}`;
}

/**
 * Who keeps what is shared in a tenant's namespace (its EgressPolicies), inside
 * a sentence: `your platform team` for the platform, `the <name>
 * organization’s admins` for an organization, `the namespace’s admins` else.
 */
export function tenantAdminsOf(
  namespace: string,
  directory: OrganizationDirectory,
): string {
  if (namespace === PLATFORM_TENANT_NAMESPACE) {
    return 'your platform team';
  }
  const organization = organizationNameOf(namespace, directory);
  return organization
    ? `the ${organization} organization’s admins`
    : 'the namespace’s admins';
}

/**
 * Who grants a person access to a tenant's agents, in one sentence, for an
 * empty roster or a refusal. The portal does not know which groups an
 * installation binds, so it names the roles and who binds them.
 */
export const ACCESS_GRANT_HINT =
  'Access to agents is granted per organization: your platform team binds your group to agent-platform:user (use the agents) or agent-platform:editor (also create, change and delete them) in the organization’s namespace.';
