import type { MCPServer } from './k8s';
import { familyDisplayNameAnnotation } from './serverGrouping';

/**
 * A muster server's name as Customize lists it: its family's for a family
 * member (`agentlab-mcp-kubernetes` → `kubernetes`), else its own — the
 * `ui.giantswarm.io/display-name` where one is set, the resource name
 * otherwise. Where two of the given (distinct) names would read the same —
 * two members of one family — those keep their own resource names, so the
 * rows stay apart.
 */
export function connectorNames(
  names: string[],
  servers: MCPServer[],
): Map<string, string> {
  const byName = new Map(servers.map(server => [server.getName(), server]));
  const familyLabels = new Map<string, string>();
  for (const family of new Set(servers.map(server => server.getFamily()))) {
    if (family) {
      familyLabels.set(
        family,
        familyDisplayNameAnnotation(
          servers.filter(server => server.getFamily() === family),
        ) ?? family,
      );
    }
  }
  const labelOf = (name: string): string => {
    const server = byName.get(name);
    const family = server?.getFamily();
    if (family) {
      return familyLabels.get(family) ?? family;
    }
    return server?.getDisplayName() ?? name;
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
