import { createContext, ReactNode, useContext } from 'react';

/**
 * The connector a `usedBy` attachment of `sub-page:muster/mcp-servers`
 * describes, read with {@link useConnectorPageTarget}.
 */
export type ConnectorPageTarget = {
  /** The connector's name: its server's, or its family's for a family. */
  name: string;
  /** The installation whose muster serves the connector. */
  installation: string;
  /**
   * The names a `server:` toolset selector reaches the connector by: its own
   * and, for a family, each instance's.
   */
  serverNames: string[];
  /** Whether a muster tool name belongs to this connector. */
  ownsTool: (toolName: string) => boolean;
  /**
   * How many of its tools are annotated read-only. Undefined until its tools
   * are read, which needs the muster session.
   */
  readOnlyToolCount?: number;
};

const ConnectorPageTargetContext = createContext<
  ConnectorPageTarget | undefined
>(undefined);

export function ConnectorPageTargetProvider({
  target,
  children,
}: {
  target: ConnectorPageTarget;
  children: ReactNode;
}) {
  return (
    <ConnectorPageTargetContext.Provider value={target}>
      {children}
    </ConnectorPageTargetContext.Provider>
  );
}

/**
 * The connector of the shell's connector page an attachment renders on.
 * Undefined outside that page.
 */
export function useConnectorPageTarget(): ConnectorPageTarget | undefined {
  return useContext(ConnectorPageTargetContext);
}
