/**
 * Tenants: who an agent belongs to (giantswarm/giantswarm#36698, D1 and D6).
 *
 * A tenant is a namespace: the installation's `kagent` namespace is the
 * platform tenant, the platform's agents for everyone, and an Organization's
 * `org-<name>` namespace is that organization's tenant. Kubernetes RBAC in the
 * namespace decides who sees and changes its agents; the portal only names the
 * tenant. The portal never says "tenant": under the label "Organization" a
 * person reads the organization's name, or "None" for the platform, whose
 * agents are available to all organizations; the New agent form offers the
 * platform as "Platform".
 */

import { DEFAULT_MODEL_CONFIG_NAMESPACE } from '../components/ModelConfigPicker/helpers';

/** The platform tenant's namespace: the installation's `kagent` namespace. */
export const PLATFORM_TENANT_NAMESPACE = DEFAULT_MODEL_CONFIG_NAMESPACE;

/** The start of an Organization's namespace name. */
export const ORGANIZATION_PREFIX = 'org-';

/**
 * Records who created an agent, on its HelmRelease and its `Agent`: written
 * by agent-manager on create (the caller's email), never changed, and for
 * display and filtering only, never an authorization input.
 */
export const CREATED_BY_ANNOTATION = 'agent-platform.giantswarm.io/created-by';

/** The Organization an `org-<name>` namespace is; none for any other. */
export function organizationOf(namespace: string): string | undefined {
  if (!namespace.startsWith(ORGANIZATION_PREFIX)) {
    return undefined;
  }
  return namespace.slice(ORGANIZATION_PREFIX.length) || undefined;
}

/** The platform as the New agent form offers it, a kind of place. */
const PLATFORM_LABEL = 'Platform';

/**
 * What the platform tenant reads as under the label "Organization": the
 * platform is no organization, its agents are available to all of them
 * (`OrganizationValue` says so beside it).
 */
const NO_ORGANIZATION = 'None';

/**
 * The tenant a namespace is, as a value under the label "Organization":
 * `None` for the platform tenant, which is no organization, the
 * organization's plain name for an Organization's `org-<name>` namespace, and
 * `namespace <name>` for any other namespace agents live in, which is no
 * organization either. An organization whose plain name would read as the
 * platform's keeps its qualifier (`organization none`), so the two never sit
 * side by side as one word.
 */
export function tenantOf(namespace: string): string {
  if (namespace === PLATFORM_TENANT_NAMESPACE) {
    return NO_ORGANIZATION;
  }
  const organization = organizationOf(namespace);
  if (organization === undefined) {
    return `namespace ${namespace}`;
  }
  return organization.toLowerCase() === NO_ORGANIZATION.toLowerCase()
    ? `organization ${organization}`
    : organization;
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

/** The kind of place a namespace is. */
export function tenantKindOf(namespace: string): TenantKind {
  if (namespace === PLATFORM_TENANT_NAMESPACE) {
    return 'platform';
  }
  return organizationOf(namespace) === undefined ? 'namespace' : 'organization';
}

/**
 * The namespaces of `choices` by their kind, and the kinds present, in the
 * order the form offers them: Platform, Organization, Other namespace.
 */
export function tenantGroups(choices: readonly string[]): {
  kinds: TenantKind[];
  byKind: Record<TenantKind, string[]>;
} {
  const byKind: Record<TenantKind, string[]> = {
    platform: [],
    organization: [],
    namespace: [],
  };
  for (const namespace of choices) {
    byKind[tenantKindOf(namespace)].push(namespace);
  }
  const kinds = (['platform', 'organization', 'namespace'] as const).filter(
    kind => byKind[kind].length > 0,
  );
  return { kinds, byKind };
}

/**
 * The place a new agent's form picks among `choices`: the first in the order
 * the form offers them (Platform, then the organizations, then the other
 * namespaces).
 */
export function defaultTenant(choices: readonly string[]): string | undefined {
  const { kinds, byKind } = tenantGroups(choices);
  return kinds.length > 0 ? byKind[kinds[0]][0] : undefined;
}

/**
 * The tenant a namespace is, inside a sentence: `the platform`, `the <name>
 * organization`, or `namespace <name>`.
 */
export function tenantInSentence(namespace: string): string {
  if (namespace === PLATFORM_TENANT_NAMESPACE) {
    return 'the platform';
  }
  const organization = organizationOf(namespace);
  return organization
    ? `the ${organization} organization`
    : `namespace ${namespace}`;
}

/**
 * Who keeps what is shared in a tenant's namespace (its EgressPolicies), inside
 * a sentence: `your platform team` for the platform, `the <name>
 * organization’s admins` for an organization, `the namespace’s admins` else.
 */
export function tenantAdminsOf(namespace: string): string {
  if (namespace === PLATFORM_TENANT_NAMESPACE) {
    return 'your platform team';
  }
  const organization = organizationOf(namespace);
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
