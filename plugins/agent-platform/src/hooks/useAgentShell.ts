import { featureFlagsApiRef, useApi } from '@backstage/frontend-plugin-api';
import {
  AGENT_SHELL_FLAG,
  isAgentShellOn,
} from '@giantswarm/backstage-plugin-agent-platform-common';

export { AGENT_SHELL_FLAG };

/**
 * Whether the portal renders inside the agent-platform shell, whose own rail
 * navigates between the plugin's screens and lists the recent sessions — as
 * this app load decided it (see `isAgentShellOn`).
 */
export function useAgentShell(): boolean {
  return isAgentShellOn(useApi(featureFlagsApiRef));
}
