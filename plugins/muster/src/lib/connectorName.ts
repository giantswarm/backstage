import type { MCPServer } from './k8s';
import { mcpServerDisplayNames } from './serverGrouping';

/**
 * A muster server's name as Customize lists it: its family's for a family
 * member (`agentlab-mcp-kubernetes` → `kubernetes`), else its own — each by
 * the rule of `connectorDisplayNames` (the `ui.giantswarm.io/display-name`
 * where one tells it apart, the resource name otherwise). Where two of the
 * given (distinct) names would still read the same — two members of one
 * family — those keep their own resource names, so the rows stay apart.
 */
export function connectorNames(
  names: string[],
  servers: MCPServer[],
): Map<string, string> {
  const byName = new Map(servers.map(server => [server.getName(), server]));
  const labels = mcpServerDisplayNames(servers);
  const labelOf = (name: string): string => {
    const surface = byName.get(name)?.getFamily() ?? name;
    return labels.get(surface) ?? surface;
  };
  const unique = [...new Set(names)];
  const shown = unique.map(labelOf);
  const seen = new Map<string, number>();
  for (const label of shown) {
    seen.set(label, (seen.get(label) ?? 0) + 1);
  }
  return new Map(
    unique.map((name, index) => [
      name,
      seen.get(shown[index])! > 1 ? name : shown[index],
    ]),
  );
}
