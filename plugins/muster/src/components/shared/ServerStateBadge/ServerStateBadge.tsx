import {
  DEACTIVATED_LABEL,
  MCPServer,
  mcpServerStateSeverity,
} from '../../../lib/k8s';
import { StateBadge } from '../StateBadge';
import { severityTone } from '../tones';

/**
 * One server's state as a badge. A deactivated server reads `Deactivated`
 * rather than the `Disconnected` its status carries: the durable switch is the
 * reason, the state only the symptom.
 */
export function ServerStateBadge({ server }: { server: MCPServer }) {
  return (
    <StateBadge
      tone={severityTone(mcpServerStateSeverity(server.getState()))}
      label={serverStateLabel(server)}
      title={server.getStateExplanation()}
    />
  );
}

/** The words of {@link ServerStateBadge}, for a place that shows plain text. */
export function serverStateLabel(server: MCPServer): string {
  return server.getSuspended()
    ? DEACTIVATED_LABEL
    : (server.getState() ?? 'unknown');
}
