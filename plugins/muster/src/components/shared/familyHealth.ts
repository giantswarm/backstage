import { MCPServer, mcpServerStateSeverity } from '../../lib/k8s';

/**
 * A server family's health in words: "24 of 26 instances healthy". Generic on
 * purpose -- a family's instances may be management clusters, accounts or
 * machines.
 */
export function familyHealthLabel(instances: MCPServer[]): string {
  const healthy = instances.filter(
    s => mcpServerStateSeverity(s.getState()) === 'ok',
  ).length;
  return `${healthy} of ${instances.length} instances healthy`;
}
