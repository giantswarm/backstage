import { createContext, ReactNode, useContext } from 'react';

const ShellScopeContext = createContext(false);

/**
 * Marks everything below it as rendering inside the agent-platform shell.
 * Shared components that behave differently in the shell (`InfoHint`'s
 * popover, `FactList`'s phone stacking) read it, so classic pages, which
 * mount none, keep their established behavior.
 *
 * The app mounts it around the shell's pages, as it does `DateTimeZoneProvider`.
 */
export function ShellScopeProvider({
  inShell = true,
  children,
}: {
  inShell?: boolean;
  children?: ReactNode;
}) {
  return (
    <ShellScopeContext.Provider value={inShell}>
      {children}
    </ShellScopeContext.Provider>
  );
}

/** Whether this renders inside the agent-platform shell; `false` outside any provider. */
export function useShellScope(): boolean {
  return useContext(ShellScopeContext);
}
