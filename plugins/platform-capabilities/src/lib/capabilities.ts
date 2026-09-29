/**
 * The platform's capabilities by name: the definitions
 * giantswarm-platform-manager serves, as the page knows them before the
 * manager has answered. The Installations table has their columns on its
 * first render; `get_info` and the listing confirm the set, and a definition
 * the plugin does not know yet joins it once the manager names it.
 */
export const KNOWN_CAPABILITIES: readonly string[] = [
  'agent-platform',
  'customer-portal',
];

/**
 * The columns' order for a set of capabilities: by name, whatever order the
 * source lists them in, so the columns never swap places between the plugin's
 * set, the manager's definitions and the listing.
 */
export function orderCapabilities(names: readonly string[]): string[] {
  return [...new Set(names)].sort((a, b) => a.localeCompare(b));
}
