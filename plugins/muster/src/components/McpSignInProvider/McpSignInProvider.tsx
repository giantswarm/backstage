import {
  createContext,
  lazy,
  type ReactNode,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { QueryClientProvider } from '../QueryClientProvider';
import { useMcpServersAwaitingSignIn } from '../McpAuthDialog/useMcpServersAwaitingSignIn';
import { useServerLabels } from '../McpAuthDialog/useServerLabels';
import { useSignInInstallation } from './useSignInInstallation';
import { useSettledWaiting } from './hooks';

// Loaded on the first sign-in only: the provider is mounted on every shell
// page, the dialog (and its per-server sign-in) is rarely opened.
const LazyMcpAuthDialog = lazy(() =>
  import('../McpAuthDialog/McpAuthDialog').then(m => ({
    default: m.McpAuthDialog,
  })),
);

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
  /**
   * The servers waiting for the person's sign-in or grant, by name, once
   * muster's status has settled (`useSettledWaiting`): never one muster is
   * still connecting for a fresh session.
   */
  waiting: McpServerAwaitingSignIn[];
  /**
   * The servers muster reports connected for the person, by name: signed in
   * to, or connected with the portal sign-in. A server in neither list (not
   * registered yet, still starting) is in neither state.
   */
  connected: string[];
  /**
   * The status has been read once, or there is nothing to read: until then
   * `waiting` is empty for want of an answer.
   */
  isRead: boolean;
  /**
   * The first settling of `waiting` is over (`useSettledWaiting`): what a
   * fresh load found is in it. Stays true once it is.
   */
  isSettled: boolean;
  /**
   * muster answered with a status. False while it could not say (not read
   * yet, the read failed, muster unavailable): an empty `waiting` then says
   * nothing about the servers.
   */
  isAvailable: boolean;
  /**
   * Opens muster's sign-in dialog over the page; does nothing while there is
   * no home installation to sign in to.
   */
  openSignIn: () => void;
};

type ReadStatus = Omit<McpSignInStatus, 'openSignIn'>;

const NOT_READ: ReadStatus = {
  waiting: [],
  connected: [],
  isRead: false,
  isSettled: false,
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
  // Silent, as a reader in the background must be: the status read never
  // asks for the sign-in and stops while the portal session is gone, and the
  // display names are read once and not while the session is gone (#3058).
  const {
    waiting: reported,
    statuses,
    isLoading,
    isAvailable,
    sessionExpired,
    connecting,
    readAt,
    answeredAt,
    refetch,
  } = useMcpServersAwaitingSignIn(installation, {
    enabled: Boolean(installation),
  });
  // Only what has settled: a fresh load reads servers muster is still
  // connecting for the session.
  const { waiting, isSettled: hasSettled } = useSettledWaiting({
    waiting: reported,
    connecting,
    readAt,
    answeredAt,
    sessionExpired,
    refetch,
  });
  const labelOf = useServerLabels(installation, waiting, {
    enabled: !sessionExpired,
  });

  const isRead = installation ? !isLoading : !isInstallationLoading;
  // Without a home installation there is nothing to settle.
  const isSettled = installation ? hasSettled : isRead;
  // Handed up only when what it says changes, compared as JSON: a display
  // name may hold any character.
  const key = JSON.stringify([
    waiting.map(name => [name, labelOf(name)]),
    statuses
      .filter(status => status.status === 'connected')
      .map(status => status.name),
  ]);
  useEffect(() => {
    const [servers, connected]: [Array<[string, string]>, string[]] =
      JSON.parse(key);
    onRead({
      installation,
      waiting: servers.map(([name, label]) => ({ name, label })),
      connected,
      isRead,
      isSettled,
      // A status kept from before the session expired is no answer now.
      isAvailable: isAvailable && !sessionExpired,
    });
  }, [
    installation,
    key,
    isRead,
    isSettled,
    isAvailable,
    sessionExpired,
    onRead,
  ]);

  if (!installation || !isDialogOpen) {
    return null;
  }
  return (
    <Suspense fallback={null}>
      <LazyMcpAuthDialog
        isOpen
        onOpenChange={onDialogOpenChange}
        installation={installation}
      />
    </Suspense>
  );
}

/**
 * The person's MCP sign-in status, for the Agent Platform shell's
 * Notification inbox: which MCP servers of the person's home installation
 * wait for their own sign-in or grant (muster's per-user `auth://status`,
 * `auth_required` or `reauth_required`, never an SSO server), once that has
 * settled (`useSettledWaiting`), and muster's sign-in dialog to sign in to
 * them.
 *
 * The status is read under the muster plugin's query client, every five
 * minutes and when the tab regains focus, so a sign-in finished in the
 * dialog or on a muster page updates it at once. Its children keep the query
 * client they were mounted under. Mount it once, where the inbox is.
 *
 * Only the home installation is read, and the dialog only opens for it:
 * another installation's muster needs a brokered token, and its servers are
 * signed in to where they are used.
 */
export function McpSignInProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<ReadStatus>(NOT_READ);
  const [isDialogOpen, setDialogOpen] = useState(false);
  const hasInstallation = Boolean(status.installation);
  const openSignIn = useCallback(() => {
    if (hasInstallation) {
      setDialogOpen(true);
    }
  }, [hasInstallation]);

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
