import { useEffect, useLayoutEffect, useState } from 'react';
import { identityApiRef, useApi } from '@backstage/core-plugin-api';
import { makeStyles, Theme } from '@material-ui/core';
import { Alert, Button, Flex, Text } from '@backstage/ui';
import {
  FLOATING_NOTICE_CLEARANCE_VAR,
  WIZARD_FOOTER_HEIGHT_VAR,
} from '@giantswarm/backstage-plugin-ui-react';
import { QueryClientProvider } from '../QueryClientProvider';
import { McpAuthDialog } from './McpAuthDialog';
import { useServerLabels } from './useServerLabels';
import { useMcpServersAwaitingSignIn } from './useMcpServersAwaitingSignIn';
import { useNoticeInstallation } from './useNoticeInstallation';

/**
 * Where a hidden notice is remembered: the servers it named, for the browser
 * session. A server that starts to wait later brings the notice back.
 */
export const HIDDEN_NOTICE_STORAGE_KEY = 'muster.mcpAuthNotice.hidden';

/** How many server names the notice spells out before "and n more". */
const NAMED_SERVERS = 3;

/**
 * What is docked at the bottom of the view under the notice, which it stands
 * clear of: the shell's mobile bottom bar, a WizardFrame's footer (Continue,
 * Create) and the session page's docked composer (Send). Each is published as
 * a CSS variable on the document root while it is there, 0px otherwise.
 */
const DOCKED_BELOW = [
  'var(--agent-shell-mobile-bar-height, 0px)',
  `var(${WIZARD_FOOTER_HEIGHT_VAR}, 0px)`,
  'var(--session-dock-height, 0px)',
].join(' + ');

/** The notice's distance from the view's edges, published on the notice. */
const GAP_VAR = '--mcp-auth-notice-gap';

const useStyles = makeStyles((theme: Theme) => ({
  // Fixed in the bottom right corner, over the page and under every dialog:
  // seen on every page, classic and agent shell alike. Lifted above whatever
  // is docked at the bottom, so it never covers (or takes the clicks of) a
  // page's primary action; pages reserve the room it covers under their last
  // content (`useFloatingNoticeClearance`).
  root: {
    [GAP_VAR]: `${theme.spacing(3)}px`,
    position: 'fixed',
    right: `var(${GAP_VAR})`,
    bottom: `calc(var(${GAP_VAR}) + ${DOCKED_BELOW})`,
    zIndex: theme.zIndex.snackbar,
    width: 'min(400px, calc(100vw - 32px))',
    boxShadow: theme.shadows[6],
    borderRadius: 'var(--bui-radius-3, 8px)',
    [theme.breakpoints.down('xs')]: {
      [GAP_VAR]: '16px',
    },
  },
}));

function readHidden(): string[] {
  try {
    const raw = window.sessionStorage.getItem(HIDDEN_NOTICE_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function writeHidden(names: string[]) {
  try {
    window.sessionStorage.setItem(
      HIDDEN_NOTICE_STORAGE_KEY,
      JSON.stringify(names),
    );
  } catch {
    // Storage blocked: hidden until the next page load only.
  }
}

/**
 * Publishes what the shown notice covers above whatever is docked at the
 * bottom — its height and its gap — as FLOATING_NOTICE_CLEARANCE_VAR on the
 * document root, kept current as it wraps or the view resizes, and removed
 * once it is hidden. Pages reserve that much under their last content, so the
 * notice never covers it (on a phone it spans the whole width).
 */
function useFloatingNoticeClearance(notice: HTMLElement | null) {
  useLayoutEffect(() => {
    if (!notice) {
      return undefined;
    }
    const documentRoot = document.documentElement;
    const measure = () => {
      const height = notice.getBoundingClientRect().height;
      const gap =
        parseFloat(getComputedStyle(notice).getPropertyValue(GAP_VAR)) || 0;
      documentRoot.style.setProperty(
        FLOATING_NOTICE_CLEARANCE_VAR,
        `${Math.ceil(height + gap)}px`,
      );
    };
    measure();
    const observer =
      typeof ResizeObserver === 'undefined'
        ? undefined
        : new ResizeObserver(measure);
    observer?.observe(notice);
    return () => {
      observer?.disconnect();
      documentRoot.style.removeProperty(FLOATING_NOTICE_CLEARANCE_VAR);
    };
  }, [notice]);
}

function namedList(names: string[]): string {
  const shown = names.slice(0, NAMED_SERVERS);
  const more = names.length - shown.length;
  return more > 0 ? `${shown.join(', ')} and ${more} more` : shown.join(', ');
}

/** The notice under whichever query client is in context (tests use their own). */
export function McpAuthNoticeContent() {
  const classes = useStyles();
  const installation = useNoticeInstallation();
  const { waiting, sessionExpired } = useMcpServersAwaitingSignIn(
    installation,
    {
      enabled: Boolean(installation),
    },
  );
  const [hidden, setHidden] = useState<string[]>(readHidden);
  const [isDialogOpen, setDialogOpen] = useState(false);
  const [notice, setNotice] = useState<HTMLElement | null>(null);
  useFloatingNoticeClearance(notice);

  const labelOf = useServerLabels(installation, waiting, {
    enabled: !sessionExpired,
  });
  const isHidden = waiting.every(name => hidden.includes(name));
  const showNotice = waiting.length > 0 && !isHidden;

  const hide = () => {
    writeHidden(waiting);
    setHidden(waiting);
  };

  return (
    <>
      {showNotice && !isDialogOpen && (
        <aside
          ref={setNotice}
          className={classes.root}
          aria-label="MCP server sign-in"
        >
          <Alert
            status="warning"
            icon
            title={
              waiting.length === 1
                ? '1 MCP server needs your sign-in'
                : `${waiting.length} MCP servers need your sign-in`
            }
            description={
              <Flex direction="column" gap="2">
                <Text variant="body-small">
                  Agents and portal features cannot use{' '}
                  {waiting.length === 1 ? 'its' : 'their'} tools until you sign
                  in: {namedList(waiting.map(labelOf))}.
                </Text>
                <Flex gap="2" align="center">
                  <Button
                    variant="primary"
                    size="small"
                    onPress={() => setDialogOpen(true)}
                  >
                    Sign in
                  </Button>
                  <Button variant="tertiary" size="small" onPress={hide}>
                    Not now
                  </Button>
                </Flex>
              </Flex>
            }
          />
        </aside>
      )}
      <McpAuthDialog
        isOpen={isDialogOpen}
        onOpenChange={setDialogOpen}
        installation={installation}
      />
    </>
  );
}

/**
 * The portal-wide notice that MCP servers wait for the person's own sign-in
 * or grant, on every page, with the dialog that signs in to them. Reads the
 * home installation's muster (`useNoticeInstallation`) under the muster
 * plugin's query client, so a sign-in finished on a muster page clears it
 * too. Nothing while every server is connected, the status cannot be read,
 * or the person hid it for the servers it names.
 */
export function McpAuthNotice() {
  const identityApi = useApi(identityApiRef);
  const [isSignedIn, setSignedIn] = useState(false);

  // App root elements render beside the sign-in page too. Asking muster
  // before the portal sign-in would ask for a token of its own;
  // `getCredentials` resolves only once the person is signed in.
  useEffect(() => {
    let cancelled = false;
    identityApi
      .getCredentials()
      .then(() => !cancelled && setSignedIn(true))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [identityApi]);

  if (!isSignedIn) {
    return null;
  }
  return (
    <QueryClientProvider>
      <McpAuthNoticeContent />
    </QueryClientProvider>
  );
}
