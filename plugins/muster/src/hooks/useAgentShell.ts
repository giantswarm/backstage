import { featureFlagsApiRef, useApi } from '@backstage/frontend-plugin-api';
import { AGENT_SHELL_FLAG } from '@giantswarm/backstage-plugin-agent-platform-common';

/**
 * Whether the portal renders inside the agent-platform shell. Read from the
 * shared flag name so muster's screens switch with the agent-platform ones
 * without muster depending on the agent-platform plugin.
 */
export function useAgentShell(): boolean {
  return useApi(featureFlagsApiRef).isActive(AGENT_SHELL_FLAG);
}
