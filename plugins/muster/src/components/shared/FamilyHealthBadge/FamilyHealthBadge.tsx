import {
  MCPServer,
  MCPServerSeverity,
  mcpServerStateSeverity,
  worstSeverity,
} from '../../../lib/k8s';
import { StateBadge } from '../StateBadge';
import { severityTone } from '../tones';

/**
 * A server family's health in one badge: "24 of 26 instances healthy", in the
 * tone of its worst instance. Generic on purpose -- a family's instances may
 * be management clusters, accounts or machines.
 */
export function FamilyHealthBadge({ instances }: { instances: MCPServer[] }) {
  const severities = instances.map(s => mcpServerStateSeverity(s.getState()));
  const healthy = severities.filter(s => s === 'ok').length;
  const worst = severities.reduce<MCPServerSeverity>(worstSeverity, 'ok');
  return (
    <StateBadge
      tone={severityTone(worst)}
      label={`${healthy} of ${instances.length} instances healthy`}
    />
  );
}
