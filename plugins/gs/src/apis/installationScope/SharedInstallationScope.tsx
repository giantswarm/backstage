import {
  createContext,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  getInstallationScopeSnapshot,
  INSTALLATION_SCOPE_SEARCH_PARAM,
  subscribeInstallationScope,
  type InstallationScope,
  type InstallationScopeState,
} from './installationScopeStore';
import { useWriteScopeParam } from './useWriteScopeParam';

export type SharedInstallationScopeValue = {
  /** `?installation=` of the current address, or null. */
  urlScope: string | null;
  /** The store: what the person pinned, restored from localStorage. */
  state: InstallationScopeState;
  /** Writes a scope into `?installation=`. */
  writeScopeParam: (scope: InstallationScope) => void;
};

const SharedInstallationScopeContext = createContext<
  SharedInstallationScopeValue | undefined
>(undefined);

function SharedInstallationScopeRoot({ children }: { children: ReactNode }) {
  const [searchParams] = useSearchParams();
  const urlScope = searchParams.get(INSTALLATION_SCOPE_SEARCH_PARAM);
  const writeScopeParam = useWriteScopeParam();
  const state = useSyncExternalStore(
    subscribeInstallationScope,
    getInstallationScopeSnapshot,
    getInstallationScopeSnapshot,
  );
  const value = useMemo(
    () => ({ urlScope, state, writeScopeParam }),
    [urlScope, state, writeScopeParam],
  );
  return (
    <SharedInstallationScopeContext.Provider value={value}>
      {children}
    </SharedInstallationScopeContext.Provider>
  );
}

/**
 * Opts a view into the installation scope the Environment selector pins:
 * below it, `useInstallationScope` reads `?installation=` and the stored pin,
 * and its `setScope` writes them. Everywhere else the scope is `'all'` and
 * neither is read, so a view without a selector never follows a pin made on
 * another page.
 *
 * Mounted by the views that render the selector: the Customize page, Models,
 * Usage. Nested mounts share the outer one.
 */
export function SharedInstallationScope({ children }: { children: ReactNode }) {
  const outer = useContext(SharedInstallationScopeContext);
  if (outer) {
    return <>{children}</>;
  }
  return <SharedInstallationScopeRoot>{children}</SharedInstallationScopeRoot>;
}

/** The shared scope's sources, or undefined outside a `SharedInstallationScope`. */
export function useSharedInstallationScope():
  SharedInstallationScopeValue | undefined {
  return useContext(SharedInstallationScopeContext);
}
