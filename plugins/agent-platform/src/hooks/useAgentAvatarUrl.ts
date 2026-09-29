import { useCallback } from 'react';
import { configApiRef, useApi } from '@backstage/core-plugin-api';
import { useInstallations } from '@giantswarm/backstage-plugin-gs';
import {
  AgentAvatarUrlOptions,
  buildProxiedAgentAvatarUrl,
} from '../lib/agentAvatar';

/**
 * Returns a builder for the URL the portal renders an agent's avatar from:
 * the avatar's path served by the agent-platform backend for the agent's
 * installation, from the portal's own origin (see `lib/agentAvatar`).
 *
 * The backend proxies an installation whose base domain it knows, which is
 * the same condition the frontend can read after sign-in; the builder returns
 * `undefined` when the installation is unknown or has no `baseDomain`, or the
 * name is empty — callers render the bui `Avatar` / `CellProfile` initials
 * fallback in that case rather than a broken image.
 *
 * `backend.baseUrl` rather than the discovery API because an `<img src>` is
 * needed synchronously in render; it is the URL the app's discovery compiles
 * the plugin's base URL from, and this plugin has no per-installation
 * backend override.
 */
export function useAgentAvatarUrl() {
  const backendBaseUrl = useApi(configApiRef).getString('backend.baseUrl');
  const { installations } = useInstallations();

  return useCallback(
    (
      installation: string | undefined,
      name: string,
      opts?: AgentAvatarUrlOptions,
    ): string | undefined => {
      if (!name) {
        return undefined;
      }
      const known = installations.find(i => i.name === installation);
      if (!known?.baseDomain) {
        return undefined;
      }
      return buildProxiedAgentAvatarUrl(backendBaseUrl, known.name, name, opts);
    },
    [backendBaseUrl, installations],
  );
}
