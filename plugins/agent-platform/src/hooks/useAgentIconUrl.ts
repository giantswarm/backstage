import { useCallback } from 'react';
import { useInstallations } from '@giantswarm/backstage-plugin-gs';
import { buildAgentAvatarUrl } from '../lib/agentAvatar';

/**
 * Returns a builder for the canonical avatar URL an agent's resource records
 * as its `iconUrl` (`https://avatars.<baseDomain>/v1/<name>.png`), for every
 * A2A client to load — as opposed to `useAgentAvatarUrl`, which is the URL the
 * portal's own `<img>` loads through the backend.
 *
 * `undefined` when the installation is unknown or has no `baseDomain`, or the
 * name is empty; the caller then leaves the field out and the chart keeps its
 * default.
 */
export function useAgentIconUrl() {
  const { installations } = useInstallations();

  return useCallback(
    (installation: string | undefined, name: string): string | undefined => {
      if (!name) {
        return undefined;
      }
      const baseDomain = installations.find(
        i => i.name === installation,
      )?.baseDomain;
      if (!baseDomain) {
        return undefined;
      }
      return buildAgentAvatarUrl(baseDomain, name);
    },
    [installations],
  );
}
