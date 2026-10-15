import { useCallback } from 'react';
import { useRouteRef } from '@backstage/frontend-plugin-api';

import type { AgentRow } from '../components/AgentsDataProvider';
import { newSessionHref } from '../lib/newSessionLink';
import { newSessionExternalRouteRef } from '../routes';

/**
 * Where "New session" leads, with an agent preselected when given (see
 * {@link newSessionHref}), resolved through the `newSession` external route
 * the app binds to its home. `undefined` where the app binds none, so callers
 * leave the link out rather than point it nowhere.
 */
export function useNewSessionHref():
  ((agent?: Pick<AgentRow, 'id'>) => string) | undefined {
  const homeRoute = useRouteRef(newSessionExternalRouteRef);
  const home = homeRoute?.();
  const href = useCallback(
    (agent?: Pick<AgentRow, 'id'>) => newSessionHref(home ?? '', agent),
    [home],
  );
  return home === undefined ? undefined : href;
}
