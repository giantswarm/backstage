import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  getInstallationScopeSnapshot,
  INSTALLATION_SCOPE_SEARCH_PARAM,
  setInstallationScope,
  subscribeInstallationScope,
  type InstallationScope,
  type InstallationScopeId,
  type InstallationScopeState,
} from './installationScopeStore';
import { useWriteScopeParam } from './useWriteScopeParam';

export type SharedInstallationScopeValue = {
  /** Which selector's choice this is. */
  id: InstallationScopeId;
  /** `?installation=` of the current address, or null. */
  urlScope: string | null;
  /** The store: what the person pinned, restored from localStorage. */
  state: InstallationScopeState;
  /** Re-reads the store, for an effect that must not act on a stale render. */
  readState: () => InstallationScopeState;
  /** Pins in the store (and its localStorage key), not the URL. */
  setStored: (scope: InstallationScope) => void;
  /** Writes a scope into `?installation=`. */
  writeScopeParam: (scope: InstallationScope) => void;
};

const SharedInstallationScopeContext = createContext<
  SharedInstallationScopeValue | undefined
>(undefined);

function SharedInstallationScopeRoot({
  id,
  children,
}: {
  id: InstallationScopeId;
  children: ReactNode;
}) {
  const [searchParams] = useSearchParams();
  const urlScope = searchParams.get(INSTALLATION_SCOPE_SEARCH_PARAM);
  const writeScopeParam = useWriteScopeParam();
  const subscribe = useCallback(
    (listener: () => void) => subscribeInstallationScope(listener, id),
    [id],
  );
  const readState = useCallback(() => getInstallationScopeSnapshot(id), [id]);
  const setStored = useCallback(
    (scope: InstallationScope) => setInstallationScope(scope, id),
    [id],
  );
  const state = useSyncExternalStore(subscribe, readState, readState);
  const value = useMemo(
    () => ({ id, urlScope, state, readState, setStored, writeScopeParam }),
    [id, urlScope, state, readState, setStored, writeScopeParam],
  );
  return (
    <SharedInstallationScopeContext.Provider value={value}>
      {children}
    </SharedInstallationScopeContext.Provider>
  );
}

/**
 * Opts a view into the installation scope its Environment selector pins:
 * below it, `useInstallationScope` reads `?installation=` and the stored pin
 * of scope `id`, and its `setScope` writes them. Everywhere else the scope is
 * `'all'` and neither is read, so a view without a selector never follows a
 * pin made on another page.
 *
 * `customize` (the default) is mounted by the Customize page and Models,
 * `usage` by Usage: siblings, each with its own choice. A nested mount of the
 * same scope shares the outer one.
 */
export function SharedInstallationScope({
  id = 'customize',
  children,
}: {
  id?: InstallationScopeId;
  children: ReactNode;
}) {
  const outer = useContext(SharedInstallationScopeContext);
  if (outer?.id === id) {
    return <>{children}</>;
  }
  return (
    <SharedInstallationScopeRoot id={id}>
      {children}
    </SharedInstallationScopeRoot>
  );
}

/** The shared scope's sources, or undefined outside a `SharedInstallationScope`. */
export function useSharedInstallationScope():
  SharedInstallationScopeValue | undefined {
  return useContext(SharedInstallationScopeContext);
}
