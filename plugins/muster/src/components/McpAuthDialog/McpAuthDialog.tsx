import { useEffect, useMemo, useState } from 'react';
import { makeStyles, Theme } from '@material-ui/core';
import {
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Flex,
  Skeleton,
  Text,
} from '@backstage/ui';
import { countNoun } from '@giantswarm/backstage-plugin-ui-react';
import { isSsoServer, ServerSignIn } from '../shared';
import { ProviderAppList } from '../ProviderAppSignIn/ProviderAppList';
import { useMcpServersAwaitingSignIn } from './useMcpServersAwaitingSignIn';
import { useServerLabels } from './useServerLabels';
import { useOpenRows } from './hooks';

const useStyles = makeStyles((theme: Theme) => ({
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(1.5),
  },
  row: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing(1),
    paddingBottom: theme.spacing(1.5),
    borderBottom: `1px solid ${theme.palette.divider}`,
    '&:last-child': {
      borderBottom: 'none',
      paddingBottom: 0,
    },
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(0.25),
    minWidth: 0,
    flex: '1 1 220px',
  },
  name: {
    fontFamily: theme.typography.fontFamily,
    fontWeight: 600,
    fontSize: '0.875rem',
  },
}));

/**
 * What signing in to a platform server means, where its name does not say:
 * workspace-manager is its own authorization server and hands the sign-in to
 * the Git provider the installation configures, so its sign-in is the
 * GitHub grant or the GitLab login the workspaces use.
 */
const SIGN_IN_HINTS: Record<string, string> = {
  'workspace-manager':
    'Connects your GitHub or GitLab account, whichever this installation uses. Workspaces read and push repositories as you; no separate GitHub connection is needed.',
};

/**
 * The dialog's count of what still needs a sign-in: the MCP servers and the
 * connections (provider Apps) listed, in one sentence.
 */
function waitingSummary(servers: number, connections: number): string {
  if (connections === 0) {
    return servers === 1
      ? 'One MCP server needs your sign-in before agents and portal features can use its tools.'
      : `${servers} MCP servers need your sign-in before agents and portal features can use their tools.`;
  }
  if (servers === 0) {
    return connections === 1
      ? 'One connection needs your sign-in before your agents can use it.'
      : `${connections} connections need your sign-in before your agents can use them.`;
  }
  return `${countNoun(servers, 'MCP server')} and ${countNoun(
    connections,
    'connection',
  )} need your sign-in before agents and portal features can use them.`;
}

export type McpAuthDialogProps = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  /** The muster installation the servers belong to. */
  installation?: string;
  /**
   * The servers to offer, by name, for a feature that needs specific ones.
   * Without it, every server that waits for the person's sign-in.
   */
  servers?: string[];
  /**
   * The provider Apps to offer, by name (`chatgpt` for the person's ChatGPT
   * subscription), each while it needs a sign-in. Without it, every App
   * muster keeps a grant of that needs one.
   */
  apps?: string[];
};

/**
 * One place to sign in to the MCP servers that wait for the person and to
 * connect the person's provider Apps: a row per server with its state and
 * muster's sign-in (`core_auth_login`, in a new tab), and a row per provider
 * App that needs a sign-in, with its Connect (see {@link ProviderAppSignIn});
 * a connected App is disconnected on the Profile page, not here. The rows and
 * the count come from a read when the dialog opens, and are what waited
 * then, so a finished sign-in turns its row *Connected* instead of making it
 * vanish; the servers that come with the portal sign-in are summarised in one
 * line.
 */
export function McpAuthDialog({
  isOpen,
  onOpenChange,
  installation,
  servers,
  apps,
}: McpAuthDialogProps) {
  const classes = useStyles();
  const {
    statuses,
    waiting: reported,
    providerApps,
    isLoading: isFirstRead,
    answeredAt,
    refetch,
  } = useMcpServersAwaitingSignIn(installation, {
    servers,
    apps,
    enabled: isOpen,
    // Read once per opening, below, not once more when it mounts.
    refetchOnMount: false,
  });

  // The count is the status as it is now, not the one the inbox raised its
  // row from: a read when the dialog opens, and the rows wait for it. The
  // opening is noted while rendering, so the first render of a new opening
  // never takes the previous one's answer for fresh.
  const [opening, setOpening] = useState(() => ({
    isOpen,
    at: isOpen ? Date.now() : Infinity,
  }));
  if (opening.isOpen !== isOpen) {
    setOpening({ isOpen, at: isOpen ? Date.now() : Infinity });
  }
  const openedAt = opening.at;
  useEffect(() => {
    if (openedAt !== Infinity) {
      refetch();
    }
  }, [openedAt, refetch]);
  const isFresh = isOpen && answeredAt >= openedAt;
  const isLoading = isFirstRead || !isFresh;
  const waiting = useMemo(() => (isFresh ? reported : []), [isFresh, reported]);
  // A provider App is listed while it needs a sign-in; one already connected
  // is disconnected on the Profile page's Connections, not here.
  const appsWaiting = useMemo(
    () =>
      isFresh
        ? providerApps
            .filter(app => app.status !== 'connected')
            .map(app => app.name)
        : [],
    [isFresh, providerApps],
  );

  // The rows, fixed while the dialog is open: the servers and Apps waiting
  // when it opened, plus any that start to wait while it is, so a finished
  // sign-in turns its row connected instead of making it vanish.
  const rows = useOpenRows(isOpen, waiting);
  const appRows = useOpenRows(isOpen, appsWaiting);

  const labelOf = useServerLabels(installation, rows);
  const remaining = rows.filter(name => waiting.includes(name)).length;
  const appsRemaining = appRows.filter(name =>
    appsWaiting.includes(name),
  ).length;
  const listedApps = providerApps.filter(app => appRows.includes(app.name));
  // Servers muster connects from the portal sign-in itself (token forwarding
  // or exchange): nothing to do, said in one line.
  const withSignIn = statuses.filter(
    status =>
      status.status === 'connected' &&
      isSsoServer(status) &&
      !rows.includes(status.name),
  ).length;

  // Only the Apps were asked for (a feature that needs the person's own
  // subscription): nothing to say about servers.
  const appsOnly = servers?.length === 0 && providerApps.length > 0;
  const listed = rows.length + appRows.length;
  const pending = remaining + appsRemaining;
  let summary: string | undefined;
  if (appsOnly) {
    // The feature's own prompt says why; only an App that turned out to be
    // connected already needs a word, or the dialog would be empty.
    summary =
      !isLoading && listed === 0
        ? 'You are signed in to everything here.'
        : undefined;
  } else if (listed === 0) {
    summary = 'You are signed in to every MCP server here.';
  } else if (pending === 0) {
    summary =
      appRows.length === 0
        ? 'Done: you are signed in to every server listed.'
        : 'Done: you are signed in to everything listed.';
  } else {
    summary = waitingSummary(remaining, appsRemaining);
  }

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      width="min(90vw, 560px)"
    >
      <DialogHeader>
        {appsOnly ? 'Sign in to your connections' : 'Sign in to MCP servers'}
      </DialogHeader>
      <DialogBody>
        <Flex direction="column" gap="3">
          {isLoading ? (
            <Flex direction="column" gap="2" aria-busy="true">
              <Text variant="body-small" color="secondary">
                Checking which servers need your sign-in…
              </Text>
              <Skeleton width="100%" height={40} />
            </Flex>
          ) : (
            <>
              {summary && (
                <Text variant="body-medium" role="status">
                  {summary}
                </Text>
              )}
              {listedApps.length > 0 && (
                <ProviderAppList
                  apps={listedApps}
                  installation={installation}
                  canDisconnect={false}
                />
              )}
              {rows.length > 0 && (
                <ul className={classes.list} aria-label="MCP servers">
                  {rows.map(name => (
                    <li key={name} className={classes.row}>
                      <span className={classes.label}>
                        <span className={classes.name}>{labelOf(name)}</span>
                        {SIGN_IN_HINTS[name] && (
                          <Text variant="body-small" color="secondary">
                            {SIGN_IN_HINTS[name]}
                          </Text>
                        )}
                      </span>
                      {waiting.includes(name) ? (
                        <ServerSignIn
                          serverName={name}
                          displayName={labelOf(name)}
                          installation={installation}
                        />
                      ) : (
                        <Text variant="body-small" color="success">
                          ✓ Connected
                        </Text>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {remaining > 0 && (
                <Text variant="body-small" color="secondary">
                  Each sign-in opens in a new tab. Come back here when it is
                  done; the row updates on its own.
                </Text>
              )}
              {withSignIn > 0 && (
                <Text variant="body-small" color="secondary">
                  {withSignIn === 1
                    ? '1 more server comes with your portal sign-in.'
                    : `${withSignIn} more servers come with your portal sign-in.`}
                </Text>
              )}
            </>
          )}
        </Flex>
      </DialogBody>
      <DialogFooter>
        <Button
          variant={pending === 0 && !isLoading ? 'primary' : 'secondary'}
          onPress={() => onOpenChange(false)}
        >
          {pending === 0 && !isLoading ? 'Done' : 'Close'}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
