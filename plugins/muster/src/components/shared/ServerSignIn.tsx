import { makeStyles, Theme } from '@material-ui/core';
import { Button, ButtonLink, Link, Text } from '@backstage/ui';
import { ServerSignInState, useServerSignIn } from './useServerSignIn';

const useStyles = makeStyles((theme: Theme) => ({
  root: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.spacing(1),
  },
  // ServerAuthActions renders inside the servers page's action row, itself a
  // wrapping flex. Dissolving this wrapper keeps the short affordances inline
  // with the lifecycle buttons while the long texts (fullRow) wrap to their
  // own line -- as a nested flex item the whole cluster would grow wide and
  // jumble the row instead.
  inActionRow: {
    display: 'contents',
  },
  // Explanatory sentences are far wider than any button: give them the full
  // row rather than letting them squeeze between the buttons. `order` moves
  // them after every default-order sibling, so in the action row they wrap
  // below the buttons instead of pushing them onto a following line.
  fullRow: {
    flexBasis: '100%',
    minWidth: 0,
    order: 1,
  },
  name: {
    fontFamily: theme.typography.fontFamily,
    fontSize: '0.8125rem',
  },
}));

/**
 * Muster's feedback for the last auth action. Rendered after the affordance,
 * never instead of it: a specific refusal (rate limit, issuer discovery) or a
 * confirmation must not swap out the action the user would take next.
 */
function Messages({ state }: { state: ServerSignInState }) {
  const classes = useStyles();
  const { error, note } = state;
  if (!error && !note) {
    return null;
  }
  return (
    <>
      {note ? (
        <Text variant="body-small" color="secondary" className={classes.fullRow}>
          {note}
        </Text>
      ) : null}
      {error ? (
        <Text variant="body-small" color="danger" className={classes.fullRow}>
          {error}
        </Text>
      ) : null}
    </>
  );
}

/**
 * SSO-managed servers (token forwarding/exchange) get an explanation instead
 * of a button: their connection comes from muster's own session, so there is
 * nothing for the user to sign in to (and muster refuses a manual logout).
 */
function SsoExplanation({
  serverName,
  state,
}: {
  serverName: string;
  state: ServerSignInState;
}) {
  const classes = useStyles();
  return (
    <Text
      as="p"
      variant="body-small"
      color="secondary"
      className={classes.fullRow}
    >
      {serverName} authenticates through SSO from muster's own session, so there
      is nothing to sign in to here.
      {state.status?.sso_attempt_failed
        ? " muster tried and failed to establish it for your session — check the server's trusted audiences with an administrator."
        : ''}
    </Text>
  );
}

/**
 * The sign-in affordance: a button that asks muster for a sign-in URL
 * (`core_auth_login`) and opens it directly in a new tab -- completing the
 * flow there connects the server for this muster session and the surrounding
 * content unblocks on its own (see {@link useServerSignIn}). While the flow is
 * outstanding this renders the wait, with the URL as a link -- quiet when the
 * tab is already open (closed it, lost it behind others), prominent when the
 * popup was blocked and the link is the only way in.
 */
function SignInFlow({
  state,
  prominent,
}: {
  state: ServerSignInState;
  /**
   * Primary styling. On the MCP servers page the sign-in is the single action
   * an auth-gated server needs, so it outranks the secondary lifecycle
   * buttons sharing its row.
   */
  prominent?: boolean;
}) {
  const classes = useStyles();
  const { authUrl, clientIdMethod, isPending, signIn, signInTabOpened } = state;

  if (!authUrl) {
    return (
      <Button
        variant={prominent ? 'primary' : 'secondary'}
        size="small"
        isPending={isPending}
        onClick={signIn}
      >
        {isPending ? 'Signing in…' : 'Sign in'}
      </Button>
    );
  }

  return (
    <>
      {signInTabOpened ? (
        <>
          <Text variant="body-small" color="secondary">
            Waiting for you to finish signing in…
          </Text>
          <Link
            href={authUrl}
            target="_blank"
            rel="noopener noreferrer"
            variant="body-small"
          >
            Reopen sign-in page ↗
          </Link>
        </>
      ) : (
        <>
          <ButtonLink
            href={authUrl}
            target="_blank"
            rel="noopener noreferrer"
            variant={prominent ? 'primary' : 'secondary'}
            size="small"
          >
            Open sign-in page ↗
          </ButtonLink>
          <Text variant="body-small" color="secondary">
            Waiting for you to finish signing in…
          </Text>
        </>
      )}
      {/* muster#1083: the challenge says how muster identifies itself to
          the authorization server. Only the fallbacks deserve a warning —
          they are the cases where the AS may reject the sign-in as an
          unregistered client. DCR gets a quiet note because the consent
          screen will show an auto-registered client rather than a
          pre-provisioned one, which can otherwise look suspicious. */}
      {clientIdMethod === 'cimd-fallback' ? (
        <Text variant="body-small" color="warning" className={classes.fullRow}>
          This server's authorization server advertises neither support for
          muster's client identity (CIMD) nor automatic client registration —
          the sign-in may be rejected as an unregistered client.
        </Text>
      ) : null}
      {/* muster#1086: distinct from cimd-fallback — the AS does offer
          client registration but rejected muster's request (its actual
          rejection is in muster's challenge message and logs). */}
      {clientIdMethod === 'dcr-failed' ? (
        <Text variant="body-small" color="warning" className={classes.fullRow}>
          This server's authorization server rejected muster's automatic client
          registration — the sign-in may be rejected as an unregistered client.
        </Text>
      ) : null}
      {clientIdMethod === 'dcr' ? (
        <Text
          variant="body-small"
          color="secondary"
          className={classes.fullRow}
        >
          muster registered itself with this server's authorization server
          automatically (Dynamic Client Registration).
        </Text>
      ) : null}
    </>
  );
}

export interface ServerSignInProps {
  /** The muster server name, as reported by `list_tools` / `auth://status`. */
  serverName: string;
  installation?: string;
  /** Show the server name next to the action (the tool explorer's list). */
  showName?: boolean;
}

/**
 * The always-rendered "Sign in" affordance for one OAuth-protected aggregated
 * MCP server, for surfaces that already know the server is auth-gated (the
 * tool explorer's alert, the new-server verify page). The MCP servers page
 * instead renders {@link ServerAuthActions}, which gates itself on
 * `auth://status` and adds the sign-out affordance.
 *
 * SSO-managed servers get an explanation instead of a button: a status like
 * `failed`/`sso_pending` would otherwise leave the surrounding alert claiming
 * a server needs authentication with no name, action, or reason shown.
 */
export function ServerSignIn({
  serverName,
  installation,
  showName,
}: ServerSignInProps) {
  const classes = useStyles();
  const state = useServerSignIn(serverName, installation);

  if (state.isSsoManaged) {
    return (
      <div className={classes.root}>
        <SsoExplanation serverName={serverName} state={state} />
        {/* Rendered under the paragraph, not instead of it: a specific refusal
            (rate limit, issuer discovery) must not be swapped for the generic
            SSO explanation. */}
        <Messages state={state} />
      </div>
    );
  }

  return (
    <div className={classes.root}>
      {showName ? <code className={classes.name}>{serverName}</code> : null}
      <SignInFlow state={state} />
      <Messages state={state} />
    </div>
  );
}

export interface ServerAuthActionsProps {
  /** The muster server name, as reported by `auth://status`. */
  serverName: string;
  installation?: string;
  /** Show the server name next to the action (per-instance lists). */
  showName?: boolean;
  /**
   * Whether the server's CR declares per-user OAuth (`spec.auth.type ===
   * 'oauth'`). `auth://status` reports a no-auth server as `connected` too, so
   * the status alone cannot say whether a connection is a user sign-in that
   * can be undone -- this is the extra signal that gates "Sign out".
   */
  oauthConfigured?: boolean;
}

/**
 * The session-auth actions for one server on the MCP servers page, rendered in
 * the bottom action row next to the lifecycle/CRUD buttons: a prominent "Sign
 * in" while muster reports the server as needing one (or a sign-in from this
 * tab is outstanding), and "Sign out" (muster's `core_auth_logout`) while a
 * per-user OAuth server is connected. Renders nothing for a server whose state
 * asks nothing of the user, so the connected majority stays quiet -- with one
 * exception: an SSO-managed server whose automatic connection failed renders
 * the diagnosis, because this page is where an operator would look for it.
 */
export function ServerAuthActions({
  serverName,
  installation,
  showName,
  oauthConfigured,
}: ServerAuthActionsProps) {
  const classes = useStyles();
  const state = useServerSignIn(serverName, installation);
  const {
    status,
    authUrl,
    isSsoManaged,
    needsLogin,
    isConnected,
    isSigningOut,
    signOut,
  } = state;

  if (isSsoManaged) {
    // `sso_attempt_failed` names a concrete misconfiguration; a healthy (or
    // merely pending) SSO server explains itself only when muster asks the
    // user to act, which for SSO it normally never does.
    if (!needsLogin && !status?.sso_attempt_failed) {
      return null;
    }
    return (
      <div className={classes.inActionRow}>
        <SsoExplanation serverName={serverName} state={state} />
        <Messages state={state} />
      </div>
    );
  }

  // `authUrl` keeps the row alive while a sign-in this tab started is
  // outstanding, whatever the polled status currently claims.
  if (needsLogin || authUrl) {
    return (
      <div className={classes.inActionRow}>
        {showName ? <code className={classes.name}>{serverName}</code> : null}
        <SignInFlow state={state} prominent />
        <Messages state={state} />
      </div>
    );
  }

  if (oauthConfigured && isConnected) {
    return (
      <div className={classes.inActionRow}>
        {showName ? <code className={classes.name}>{serverName}</code> : null}
        <Button
          variant="secondary"
          size="small"
          isPending={isSigningOut}
          onClick={signOut}
        >
          {isSigningOut ? 'Signing out…' : 'Sign out'}
        </Button>
        <Messages state={state} />
      </div>
    );
  }

  // Idle deliberately ignores `error`/`note`: they are the answer to a click,
  // which by definition happened on a row that was already visible, so letting
  // them defeat the gate would pin an unrelated row open (they also do not
  // survive a remount, unlike the pending entry).
  return null;
}
