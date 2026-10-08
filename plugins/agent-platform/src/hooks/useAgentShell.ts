import { featureFlagsApiRef, useApi } from '@backstage/frontend-plugin-api';

/** The feature flag that makes the Agent Platform the portal's main interface. */
export const AGENT_SHELL_FLAG = 'agent-platform-shell';

/**
 * Whether the portal renders inside the agent-platform shell, whose own rail
 * navigates between the plugin's screens and lists the recent sessions.
 */
export function useAgentShell(): boolean {
  return useApi(featureFlagsApiRef).isActive(AGENT_SHELL_FLAG);
}
