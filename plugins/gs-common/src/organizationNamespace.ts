/**
 * The start of a Giant Swarm organization's namespace: the `Organization`
 * resource `<name>` owns the namespace `org-<name>`.
 */
export const ORGANIZATION_NAMESPACE_PREFIX = 'org-';

/**
 * The Giant Swarm organization a namespace names by that convention
 * (`org-marian` is `marian`), or `undefined` for any other namespace and for
 * the prefix alone.
 */
export function organizationNameOfNamespace(
  namespace: string,
): string | undefined {
  if (!namespace.startsWith(ORGANIZATION_NAMESPACE_PREFIX)) {
    return undefined;
  }
  return namespace.slice(ORGANIZATION_NAMESPACE_PREFIX.length) || undefined;
}

/**
 * The MCP server an aggregated tool belongs to: muster names it
 * `x_<server>_<tool>`, so the first `_`-delimited segment after `x_`. A prefix
 * that itself contains `_` reads as its first segment, the server's family.
 * A server in an Organization's namespace prefixes its tools with the
 * namespace first (`x_org-<name>_<server>_<tool>`), which is skipped: the
 * server, not the customer, is what a failure belongs to. Undefined for
 * muster's own tools (`core_*`, `workflow_*`, the meta-tools).
 */
export function musterServerOfTool(tool: string): string | undefined {
  if (!tool.startsWith('x_')) {
    return undefined;
  }
  const [first, second] = tool.slice('x_'.length).split('_');
  const server = first?.startsWith(ORGANIZATION_NAMESPACE_PREFIX)
    ? second
    : first;
  return server || undefined;
}
