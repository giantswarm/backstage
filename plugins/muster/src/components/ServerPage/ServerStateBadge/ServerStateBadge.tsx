import {
  DEACTIVATED_LABEL,
  MCPServer,
  mcpServerStateSeverity,
} from '../../../lib/k8s';
import { StateBadge, severityTone } from '../../shared';

/**
 * One server's state as a badge. A deactivated server reads `Deactivated`
 * rather than the `Disconnected` its status carries: the durable switch is the
 * reason, the state only the symptom.
 */
export function ServerStateBadge({ server }: { server: MCPServer }) {
  const label = server.getSuspended()
    ? DEACTIVATED_LABEL
    : (server.getState() ?? 'unknown');
  return (
    <StateBadge
      tone={severityTone(mcpServerStateSeverity(server.getState()))}
      label={label}
      title={server.getStateExplanation()}
    />
  );
}
