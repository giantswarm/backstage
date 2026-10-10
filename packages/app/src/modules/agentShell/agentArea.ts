import {
  configApiRef,
  featureFlagsApiRef,
  useApiHolder,
} from '@backstage/core-plugin-api';
import {
  readPortals,
  type Portals,
} from '@giantswarm/backstage-plugin-agent-platform-common';
import { useLocation } from 'react-router-dom';
import { AGENT_SHELL_FLAG } from './predicates';

/**
 * The routes the agent shell owns while the Agent Platform is available.
 * Everything else keeps the classic chrome, so the old portal stays fully
 * usable next to the shell. Keep in sync with the routes the shell's pages
 * register under.
 */
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
 * the Agent Platform off. Read at render time; the shell's extensions make the
 * same choice once, at app start (see `predicates.ts`).
 */
export function usePortals(): Portals {
  const apis = useApiHolder();
  return readPortals(apis.get(configApiRef), {
    agentShellOptIn: apis.get(featureFlagsApiRef)?.isActive(AGENT_SHELL_FLAG),
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
