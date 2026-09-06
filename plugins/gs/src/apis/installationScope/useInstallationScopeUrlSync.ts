import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ALL_INSTALLATIONS,
  getInstallationScopeSnapshot,
  INSTALLATION_SCOPE_SEARCH_PARAM,
  setInstallationScope,
  subscribeInstallationScope,
} from './installationScopeStore';

/**
 * Keeps the installation scope and the URL's `?installation=` in step.
 *
 * Mount it once per page (the section's selector does), inside the router:
 * it is the only writer of the search parameter, so several consumers of the
 * scope never race each other's navigations.
 *
 * Rules, in order:
 * - A parameter that *changed* (a deep link, the back button, a picker on
 *   another page) wins: the store takes its value. A parameter that
 *   disappeared (a tab link without a query string) changes nothing -- the
 *   pinned installation is the person's, not the link's.
 * - Otherwise the URL follows the store: a pinned installation is written
 *   (replace, so the history does not fill with scope changes), `'all'`
 *   removes the parameter.
 *
 * The store's own "a restored home installation reads as all" rule is applied
 * by `useInstallationScope`; this hook only mirrors what the store holds, so a
 * stale home pin never reaches the URL: the store is normalised to `'all'` in
 * the same commit the selector first renders.
 */
export function useInstallationScopeUrlSync(): void {
  const [searchParams, setSearchParams] = useSearchParams();
  const { scope, restored } = useSyncExternalStore(
    subscribeInstallationScope,
    getInstallationScopeSnapshot,
    getInstallationScopeSnapshot,
  );
  const url = searchParams.get(INSTALLATION_SCOPE_SEARCH_PARAM);
  // `undefined` until the first run, so a parameter present at mount counts as
  // a change and is adopted.
  const lastUrl = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (url !== lastUrl.current) {
      lastUrl.current = url;
      if (url !== null && url !== scope) {
        setInstallationScope(url);
        return;
      }
    }
    // A value merely restored from localStorage is not written to the URL:
    // `useInstallationScope` may still read it as "all" (the muster picker's
    // old default). Once the store is set for real, or holds nothing, mirror it.
    if (restored && scope !== ALL_INSTALLATIONS) {
      return;
    }
    const wanted = scope === ALL_INSTALLATIONS ? null : scope;
    if (url !== wanted) {
      lastUrl.current = wanted;
      setSearchParams(
        previous => {
          const next = new URLSearchParams(previous);
          if (wanted === null) {
            next.delete(INSTALLATION_SCOPE_SEARCH_PARAM);
          } else {
            next.set(INSTALLATION_SCOPE_SEARCH_PARAM, wanted);
          }
          return next;
        },
        { replace: true },
      );
    }
  }, [url, scope, restored, setSearchParams]);
}
