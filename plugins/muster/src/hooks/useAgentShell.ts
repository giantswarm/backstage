import { featureFlagsApiRef, useApi } from '@backstage/frontend-plugin-api';
import { isAgentShellOn } from '@giantswarm/backstage-plugin-agent-platform-common';

/**
 * Whether the portal renders inside the agent-platform shell, as this app load
 * decided it (see `isAgentShellOn`). Read from the shared flag so muster's
 * screens switch with the agent-platform ones without muster depending on the
 * agent-platform plugin.
 */
export function useAgentShell(): boolean {
  return isAgentShellOn(useApi(featureFlagsApiRef));
}
