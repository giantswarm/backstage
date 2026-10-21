/**
 * Tenants: who an agent belongs to (giantswarm/giantswarm#36698, D1 and D6).
 *
 * A tenant is a namespace: the installation's `kagent` namespace is the
 * platform tenant, the platform's agents for everyone, and an Organization's
 * `org-<name>` namespace is that organization's tenant. Kubernetes RBAC in the
 * namespace decides who sees and changes its agents; the portal only names the
 * tenant. The labels are the ones Slack names a tenant by (klaus-gateway's
 * `Tenant`), so a person reads the same name on both surfaces.
 */

import { DEFAULT_MODEL_CONFIG_NAMESPACE } from '../components/ModelConfigPicker/helpers';

/** The platform tenant's namespace: the installation's `kagent` namespace. */
export const PLATFORM_TENANT_NAMESPACE = DEFAULT_MODEL_CONFIG_NAMESPACE;

/** What the platform tenant is called. */
export const PLATFORM_TENANT = 'platform';

/** The start of an Organization's namespace name. */
export const ORGANIZATION_PREFIX = 'org-';

/**
 * Records who created an agent, on its HelmRelease and its `Agent`: written
 * by agent-manager on create (the caller's email), never changed, and for
 * display and filtering only, never an authorization input.
 */
export const CREATED_BY_ANNOTATION = 'agent-platform.giantswarm.io/created-by';

/**
 * The tenant a namespace is: `platform` for the platform tenant,
 * `organization <name>` for an Organization's `org-<name>` namespace, and
 * `namespace <name>` for any other namespace agents live in.
 */
export function tenantOf(namespace: string): string {
  if (namespace === PLATFORM_TENANT_NAMESPACE) {
    return PLATFORM_TENANT;
  }
  if (namespace.startsWith(ORGANIZATION_PREFIX)) {
    const organization = namespace.slice(ORGANIZATION_PREFIX.length);
    if (organization) {
      return `organization ${organization}`;
    }
  }
  return `namespace ${namespace}`;
}

/**
 * Who grants a person access to a tenant's agents, in one sentence, for an
 * empty roster or a refusal. The portal does not know which groups an
 * installation binds, so it names the roles and who binds them.
 */
export const ACCESS_GRANT_HINT =
  'Access to agents is granted per tenant: your platform team binds your group to agent-platform:user (use the agents) or agent-platform:editor (also create, change and delete them) in the organization’s namespace.';
