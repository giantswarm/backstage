import { useCallback, useRef } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { liveRouterState } from '@giantswarm/backstage-plugin-ui-react';
import {
  ALL_INSTALLATIONS,
  INSTALLATION_SCOPE_SEARCH_PARAM,
  type InstallationScope,
} from './installationScopeStore';

/**
 * Writes a scope into the URL's `?installation=`: a pinned installation is
 * set, `'all'` removes the parameter. A replacing navigation, so the history
 * does not fill with scope changes, that keeps the router state (see
 * `liveRouterState`).
 *
 * The rendered state is only the fallback for a router without a history
 * entry, so it is held in a ref: a navigation that carries or clears state
 * does not change the writer's identity.
 */
export function useWriteScopeParam(): (scope: InstallationScope) => void {
  const [, setSearchParams] = useSearchParams();
  const { state } = useLocation();
  const renderedState = useRef(state);
  renderedState.current = state;

  return useCallback(
    (scope: InstallationScope) => {
      setSearchParams(
        previous => {
          const next = new URLSearchParams(previous);
          if (scope === ALL_INSTALLATIONS) {
            next.delete(INSTALLATION_SCOPE_SEARCH_PARAM);
          } else {
            next.set(INSTALLATION_SCOPE_SEARCH_PARAM, scope);
          }
          return next;
        },
        { replace: true, state: liveRouterState(renderedState.current) },
      );
    },
    [setSearchParams],
  );
}
