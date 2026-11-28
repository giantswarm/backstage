import { useCallback } from 'react';

import { useMusterPluginApi } from './useMusterPluginApi';

/**
 * Asks the installation's muster, as the person, for a one-time sign-in
 * handoff ticket for one of its pages (approval page, connector sign-in
 * start), so the page opens signed in as them. `undefined` without the muster
 * plugin, without an installation, or when muster issues none: the page then
 * signs the browser in itself.
 */
export function useMusterHandoff(
  installation: string | undefined,
): ((url: string) => Promise<string | undefined>) | undefined {
  const musterApi = useMusterPluginApi();
  const request = useCallback(
    async (url: string) => {
      if (!musterApi || !installation) {
        return undefined;
      }
      return musterApi.requestHandoff(url, installation).catch(() => undefined);
    },
    [musterApi, installation],
  );
  return musterApi && installation ? request : undefined;
}
