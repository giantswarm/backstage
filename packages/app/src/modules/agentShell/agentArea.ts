import { featureFlagsApiRef, useApiHolder } from '@backstage/core-plugin-api';
import { useLocation } from 'react-router-dom';
import { AGENT_SHELL_FLAG } from './predicates';

/**
 * The routes the agent shell owns while the `agent-platform-shell` flag is on.
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
 * Whether the agent shell is available at all: the `agent-platform-shell`
 * feature flag, read at render time. The flag only gates availability — which
 * shell renders is decided per location by {@link useAgentShellArea}.
 */
export function useAgentShellAvailable(): boolean {
  const featureFlagsApi = useApiHolder().get(featureFlagsApiRef);
  return featureFlagsApi?.isActive(AGENT_SHELL_FLAG) ?? false;
}

/**
 * Whether the current location renders the agent shell: the shell is
 * available (flag on) and the location is in the agent area.
 */
export function useAgentShellArea(): boolean {
  const available = useAgentShellAvailable();
  const { pathname } = useLocation();
  return available && isAgentArea(pathname);
}
