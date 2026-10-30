/**
 * The Usage screen's organization scope: which organization's traffic the
 * gateway views report, and the URL parameter it travels in, so every view
 * reads the same scope and a link carries it, as the window does
 * (`usageWindow.ts`).
 *
 * The scope is a namespace, not an organization's name: the gateway labels a
 * call with the namespace its agent runs in (`agent_namespace`), and the
 * platform's `kagent` namespace and any other namespace agents run in are
 * scopes too, though no organization. The UI names a namespace under the
 * label "Organization" through `tenantOf`.
 */

/** The URL search parameter the scope travels in (`?organization=org-acme`). */
export const USAGE_ORGANIZATION_PARAM = 'organization';

/**
 * A Kubernetes namespace name: a DNS label. Anything else in the parameter is
 * not a scope the page can have, so it reads as "all organizations" rather
 * than as a query with a stray value in it (the value is escaped into PromQL
 * downstream anyway; this keeps the control and the page agreeing).
 */
const NAMESPACE_NAME = /^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$/;

/**
 * The namespace a URL parameter names, or `undefined` for every organization.
 */
export function parseUsageOrganizationParam(
  value: string | null | undefined,
): string | undefined {
  if (!value) {
    return undefined;
  }
  const namespace = value.trim();
  return NAMESPACE_NAME.test(namespace) ? namespace : undefined;
}

/**
 * The parameter value for a scope, or `undefined` for every organization,
 * which stays out of the URL so plain links keep working unchanged.
 */
export function formatUsageOrganizationParam(
  namespace: string | undefined,
): string | undefined {
  return namespace ? namespace : undefined;
}

/**
 * The same URL with the organization scope set to `namespace`, or removed for
 * every organization: what a row of the by-organization table links to.
 */
export function withUsageOrganization(
  pathname: string,
  search: string,
  namespace: string | undefined,
): string {
  const params = new URLSearchParams(search);
  const value = formatUsageOrganizationParam(namespace);
  if (value === undefined) {
    params.delete(USAGE_ORGANIZATION_PARAM);
  } else {
    params.set(USAGE_ORGANIZATION_PARAM, value);
  }
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}
