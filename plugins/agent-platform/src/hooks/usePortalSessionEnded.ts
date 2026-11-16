import { useCallback, useSyncExternalStore } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';

import { isPortalSessionRefusal } from '../lib/portalSession';

function anyReadRefused(queryClient: QueryClient): boolean {
  return queryClient
    .getQueryCache()
    .getAll()
    .some(
      query =>
        query.state.status === 'error' &&
        isPortalSessionRefusal(query.state.error),
    );
}

/**
 * Whether a read of this plugin's cache failed because the portal refused
 * the person's session token: a `PortalSessionEndedError` of this plugin's
 * clients, or the refusal as muster's own reads under the same client keep
 * it (the server lists and `/installations` that say which installation runs
 * which manager, `isPortalSessionRefusal`). The refusal is the
 * portal's, not an environment's: every read fails the same way until a
 * sign-in, so a page that gathers many reads (served models from several
 * sources, say) can say it once with `PortalSessionEndedAlert` instead of
 * naming each environment as unreadable. A failed read is never persisted,
 * so the reload that signs the person in starts without it.
 */
export function usePortalSessionEnded(): boolean {
  const queryClient = useQueryClient();
  const subscribe = useCallback(
    (onChange: () => void) => queryClient.getQueryCache().subscribe(onChange),
    [queryClient],
  );
  const read = () => anyReadRefused(queryClient);
  return useSyncExternalStore(subscribe, read, read);
}
