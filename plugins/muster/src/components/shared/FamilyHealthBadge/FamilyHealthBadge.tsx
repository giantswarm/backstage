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
  const worst = instances
    .map(s => mcpServerStateSeverity(s.getState()))
    .reduce<MCPServerSeverity>(worstSeverity, 'ok');
  return (
    <StateBadge tone={severityTone(worst)} label={familyHealthLabel(instances)} />
  );
}

/** The words of {@link FamilyHealthBadge}, for a place that shows plain text. */
export function familyHealthLabel(instances: MCPServer[]): string {
  const healthy = instances.filter(
    s => mcpServerStateSeverity(s.getState()) === 'ok',
  ).length;
  return `${healthy} of ${instances.length} instances healthy`;
}
