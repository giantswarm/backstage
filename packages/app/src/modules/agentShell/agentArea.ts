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
import { useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { usePlatformSectionConfigured } from './platformSection';

/**
 * The routes the agent shell owns while the Agent Platform is available: the
 * roots of its URL tree, which follows the rail (giantswarm/giantswarm#38510),
 * plus `/agent-platform`, the old tree, whose addresses only redirect into
 * it. Everything else keeps the classic chrome, so the old portal stays fully
 * usable next to the shell. A new root needs a decision, a check against the
 * classic routes and an entry here (the `urls` skill).
 */
/* eslint-disable giantswarm/no-restricted-syntax -- the shell's own list of its URL roots */
const AGENT_AREA_PREFIXES = [
  '/sessions',
  '/usage',
  '/profile',
  '/organizations',
  '/customize',
  '/agent-platform',
];

/**
 * The Platform section's root, in the agent area only where the deployment
 * turned the section on (`gs.features.platformSection.enabled`): elsewhere
 * the address renders as it did before the section existed.
 */
const PLATFORM_SECTION_PREFIX = '/platform';
/* eslint-enable giantswarm/no-restricted-syntax */

function isUnder(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * Whether a pathname lies in the agent area (`/` or under one of its roots),
 * `/platform` among them when `platformSection` is on.
 */
export function isAgentArea(
  pathname: string,
  { platformSection = false }: { platformSection?: boolean } = {},
): boolean {
  return (
    pathname === '/' ||
    AGENT_AREA_PREFIXES.some(prefix => isUnder(pathname, prefix)) ||
    (platformSection && isUnder(pathname, PLATFORM_SECTION_PREFIX))
  );
}

/**
 * {@link isAgentArea} with the deployment's Platform section setting, for
 * code inside the app.
 */
export function useIsAgentArea(): (pathname: string) => boolean {
  const platformSection = usePlatformSectionConfigured();
  return useCallback(
    (pathname: string) => isAgentArea(pathname, { platformSection }),
    [platformSection],
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
  const inAgentArea = useIsAgentArea();
  const { pathname } = useLocation();
  return available && inAgentArea(pathname);
}
