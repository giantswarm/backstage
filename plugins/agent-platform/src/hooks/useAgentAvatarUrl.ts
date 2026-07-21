import { useCallback } from 'react';
import { useInstallations } from '@giantswarm/backstage-plugin-gs';
import { AgentAvatarUrlOptions, buildAgentAvatarUrl } from '../lib/agentAvatar';

/**
 * Returns a builder for an agent's avatar URL, resolving an installation to its
 * base domain via the installations config.
 *
 * The builder returns `undefined` when the installation is unknown / has no
 * `baseDomain`, or the name is empty — callers render the bui `Avatar` /
 * `CellProfile` initials fallback in that case rather than a broken image.
 */
export function useAgentAvatarUrl() {
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
      const baseDomain = installations.find(
        i => i.name === installation,
      )?.baseDomain;
      if (!baseDomain) {
        return undefined;
      }
      return buildAgentAvatarUrl(baseDomain, name, opts);
    },
    [installations],
  );
}
