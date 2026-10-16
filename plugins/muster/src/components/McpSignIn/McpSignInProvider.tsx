import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { QueryClientProvider } from '../QueryClientProvider';
import { McpAuthDialog } from './McpAuthDialog';
import { useMcpServersAwaitingSignIn } from './useMcpServersAwaitingSignIn';
import { useServerLabels } from './useServerLabels';
import { useSignInInstallation } from './useSignInInstallation';

/** One MCP server that waits for the person's sign-in or grant. */
export type McpServerAwaitingSignIn = {
  /** muster's name for it. */
  name: string;
  /** What people call it: its display name, else its name. */
  label: string;
};

/** The person's MCP sign-in status, as {@link useMcpSignIn} gives it. */
export type McpSignInStatus = {
  /**
   * The installation whose servers these are: the person's home installation
   * (`undefined` while unknown, and when its muster cannot be reached).
   */
  installation?: string;
  /** The servers waiting for the person's sign-in or grant, by name. */
  waiting: McpServerAwaitingSignIn[];
  /**
   * The status has been read once, or there is nothing to read: until then
   * `waiting` is empty for want of an answer.
   */
  isRead: boolean;
  /**
   * muster answered with a status. False while it could not say (not read
   * yet, the read failed, muster unavailable): an empty `waiting` then says
   * nothing about the servers.
   */
  isAvailable: boolean;
  /** Opens muster's sign-in dialog over the page. */
  openSignIn: () => void;
};

type ReadStatus = Omit<McpSignInStatus, 'openSignIn'>;

const NOT_READ: ReadStatus = {
  waiting: [],
  isRead: false,
  isAvailable: false,
};

const McpSignInContext = createContext<McpSignInStatus | undefined>(undefined);

/**
 * Reads the status under muster's own query client and hands it up: the
 * provider's children stay under whatever client they were mounted in.
 */
function StatusReader({
  onRead,
  isDialogOpen,
  onDialogOpenChange,
}: {
  onRead: (status: ReadStatus) => void;
  isDialogOpen: boolean;
  onDialogOpenChange: (open: boolean) => void;
}) {
  const { installation, isLoading: isInstallationLoading } =
    useSignInInstallation();
  const { waiting, isLoading, isAvailable } = useMcpServersAwaitingSignIn(
    installation,
    { enabled: Boolean(installation) },
  );
  const labelOf = useServerLabels(installation, waiting);

  const isRead = installation ? !isLoading : !isInstallationLoading;
  // Handed up only when what it says changes: the servers as a key.
  const serversKey = waiting
    .map(name => `${name}\t${labelOf(name)}`)
    .join('\n');
  useEffect(() => {
    onRead({
      installation,
      waiting: serversKey
        ? serversKey.split('\n').map(line => {
            const [name, label] = line.split('\t');
            return { name, label };
          })
        : [],
      isRead,
      isAvailable,
    });
  }, [installation, serversKey, isRead, isAvailable, onRead]);

  return (
    <McpAuthDialog
      isOpen={isDialogOpen}
      onOpenChange={onDialogOpenChange}
      installation={installation}
    />
  );
}

/**
 * The person's MCP sign-in status, for the Agent Platform shell's
 * Notification inbox: which MCP servers of the person's home installation
 * wait for their own sign-in or grant (muster's per-user `auth://status`,
 * `auth_required` or `reauth_required`), and muster's sign-in dialog to sign
 * in to them.
 *
 * The status is read under the muster plugin's query client, every five
 * minutes and when the tab regains focus, so a sign-in finished in the
 * dialog or on a muster page updates it at once. Its children keep the query
 * client they were mounted under. Mount it once, where the inbox is.
 */
export function McpSignInProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<ReadStatus>(NOT_READ);
  const [isDialogOpen, setDialogOpen] = useState(false);
  const openSignIn = useCallback(() => setDialogOpen(true), []);

  const value = useMemo(
    () => ({ ...status, openSignIn }),
    [status, openSignIn],
  );

  return (
    <>
      <QueryClientProvider>
        <StatusReader
          onRead={setStatus}
          isDialogOpen={isDialogOpen}
          onDialogOpenChange={setDialogOpen}
        />
      </QueryClientProvider>
      <McpSignInContext.Provider value={value}>
        {children}
      </McpSignInContext.Provider>
    </>
  );
}

/**
 * The person's MCP sign-in status from the nearest
 * {@link McpSignInProvider}; undefined outside one.
 */
export function useMcpSignIn(): McpSignInStatus | undefined {
  return useContext(McpSignInContext);
}
