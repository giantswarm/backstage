import { useMemo } from 'react';

import type { InlineApprovals } from '../components/InlineApproval';
import { useMusterPluginApi } from './useMusterPluginApi';

/**
 * Reads and decides the person's pending approvals on the installation's
 * muster, inline in the chat (muster's decision API through the muster
 * backend, with the person's token). `undefined` without the muster plugin
 * or an installation: the chat then offers muster's page only.
 */
export function useMusterApprovals(
  installation: string | undefined,
): InlineApprovals | undefined {
  const musterApi = useMusterPluginApi();
  return useMemo(
    () =>
      musterApi && installation
        ? {
            get: (url: string) => musterApi.getApproval(url, installation),
            decide: (
              url: string,
              decision: 'approve' | 'decline',
              digest: string,
            ) => musterApi.decideApproval(url, decision, digest, installation),
          }
        : undefined,
    [musterApi, installation],
  );
}
