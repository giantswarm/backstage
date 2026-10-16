import {
  configApiRef,
  featureFlagsApiRef,
  useApiHolder,
} from '@backstage/core-plugin-api';
import {
  isAgentShellOn,
  readPortals,
  type Portals,
} from '@giantswarm/backstage-plugin-agent-platform-common';
import { useLocation } from 'react-router-dom';

/**
 * The routes the agent shell owns while the Agent Platform is available.
 * Everything else keeps the classic chrome, so the old portal stays fully
 * usable next to the shell. Keep in sync with the routes the shell's pages
 * register under.
 */
// eslint-disable-next-line giantswarm/no-restricted-syntax -- the shell's own list of its URL roots
const AGENT_AREA_PREFIXES = ['/agent-platform', '/customize'];

/** Whether a pathname lies in the agent area (`/`, `/agent-platform/**`, `/customize/**`). */
export function isAgentArea(pathname: string): boolean {
  return (
    pathname === '/' ||
    AGENT_AREA_PREFIXES.some(
      prefix => pathname === prefix || pathname.startsWith(`${prefix}/`),
    )
  );
}

/**
 * Which portals this deployment serves to the person (`app.portals`, see
 * `readPortals`): the Agent Platform shell, the classic Platform Portal, or
 * both — and so whether each shell cross-links to the other. The person's
 * `agent-platform-shell` flag counts as the opt-in while the deployment has
 * the Agent Platform off. The flag is latched at its first read
 * (`isAgentShellOn`), so the chrome keeps agreeing with the extensions, which
 * made the same choice once, at app start (see `predicates.ts`).
 */
export function usePortals(): Portals {
  const apis = useApiHolder();
  const featureFlags = apis.get(featureFlagsApiRef);
  return readPortals(apis.get(configApiRef), {
    agentShellOptIn: featureFlags ? isAgentShellOn(featureFlags) : undefined,
  });
}

/**
 * Whether the agent shell is available at all. Gates availability only —
 * which shell renders is decided per location by {@link useAgentShellArea}.
 */
export function useAgentShellAvailable(): boolean {
  return usePortals().agentPlatform;
}

/**
 * Whether the current location renders the agent shell: the shell is
 * available and the location is in the agent area.
 */
export function useAgentShellArea(): boolean {
  const available = useAgentShellAvailable();
  const { pathname } = useLocation();
  return available && isAgentArea(pathname);
}
