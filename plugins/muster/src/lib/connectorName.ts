import type { MCPServer } from './k8s';

/**
 * A muster server's name as Customize lists it: its family for a family
 * member (`agentlab-mcp-kubernetes` → `kubernetes`), else its own name. Where
 * two of the given (distinct) names would read the same — two members of one
 * family — those keep their own names, so the rows stay apart.
 */
export function connectorNames(
  names: string[],
  servers: MCPServer[],
): Map<string, string> {
  const family = new Map(
    servers.map(server => [server.getName(), server.getFamily()]),
  );
  const unique = [...new Set(names)];
  const shown = unique.map(name => family.get(name) ?? name);
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
