import { createContext, useContext, type ReactNode } from 'react';

const AllInstallationsScopeContext = createContext(false);

/**
 * Reads every installation below it, whatever the person pinned in an
 * Environment selector: `useInstallationScope` answers `'all'` here, ignores
 * `?installation=` and the stored pin, and its `setScope` changes nothing.
 *
 * For views that show no Environment selector and list across environments,
 * such as the shell's recent sessions and the Sessions page, so a pin made on
 * a Customize page does not narrow them.
 */
export function AllInstallationsScope({ children }: { children: ReactNode }) {
  return (
    <AllInstallationsScopeContext.Provider value>
      {children}
    </AllInstallationsScopeContext.Provider>
  );
}

/** Whether an {@link AllInstallationsScope} is above. */
export function useIsAllInstallationsScope(): boolean {
  return useContext(AllInstallationsScopeContext);
}
