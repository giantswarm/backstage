import { makeStyles, Theme } from '@material-ui/core';
import { Button, ButtonLink, Text } from '@backstage/ui';
import { DisabledAction } from '@giantswarm/backstage-plugin-ui-react';
import {
  ServerSignInState,
  SignInNoun,
  useServerSignIn,
} from './useServerSignIn';

/**
 * The gate reason for a deactivated server (`spec.suspended`): muster keeps it
 * disconnected, so a sign-in could at best produce a session that looks
 * connected on a server that is not. The portal withholds the button on its own
 * knowledge of the CR rather than relying on muster's refusal text.
 */
export function deactivatedSignInGate(noun: SignInNoun = 'server'): string {
  return `Deactivated ${noun}s cannot be signed in to; activate the ${noun} first.`;
}

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
        <Text
          variant="body-small"
          color="secondary"
          className={classes.fullRow}
        >
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
 * Why an SSO-managed server (token forwarding/exchange) has no sign-in: its
 * connection comes from muster's own session, so there is nothing for the
 * user to sign in to (and muster refuses a manual logout).
 */
function ssoExplanationText(
  serverName: string,
  state: ServerSignInState,
  noun: SignInNoun,
): string {
  return `${serverName} authenticates through SSO from muster's own session, so there is nothing to sign in to here.${
    state.status?.sso_attempt_failed
      ? ` muster tried and failed to establish it for your session — check the ${noun}'s trusted audiences with an administrator.`
      : ''
  }`;
}

/** What a row says while the sign-in page is open somewhere. */
export const WAITING_FOR_SIGN_IN = 'Waiting for you to finish signing in…';

/** A word on how muster identifies itself to the authorization server. */
export type ClientIdNote = { text: string; color: 'warning' | 'secondary' };

/**
 * What the challenge's client identity means for the sign-in (muster#1083),
 * where it deserves a word. Only the fallbacks are warnings -- they are the
 * cases where the AS may reject the sign-in as an unregistered client. DCR
 * gets a quiet note because the consent screen will show an auto-registered
 * client rather than a pre-provisioned one, which can otherwise look
 * suspicious.
 */
function clientIdMethodNote(
  clientIdMethod: ServerSignInState['clientIdMethod'],
  noun: SignInNoun,
): ClientIdNote | undefined {
  switch (clientIdMethod) {
    case 'cimd-fallback':
      return {
        color: 'warning',
        text: `This ${noun}'s authorization server advertises neither support for muster's client identity (CIMD) nor automatic client registration — the sign-in may be rejected as an unregistered client.`,
      };
    // muster#1086: distinct from cimd-fallback — the AS does offer client
    // registration but rejected muster's request (its actual rejection is in
    // muster's challenge message and logs).
    case 'dcr-failed':
      return {
        color: 'warning',
        text: `This ${noun}'s authorization server rejected muster's automatic client registration — the sign-in may be rejected as an unregistered client.`,
      };
    case 'dcr':
      return {
        color: 'secondary',
        text: `muster registered itself with this ${noun}'s authorization server automatically (Dynamic Client Registration).`,
      };
    default:
      return undefined;
  }
}

/**
 * SSO-managed servers (token forwarding/exchange) get an explanation instead
 * of a button: their connection comes from muster's own session, so there is
 * nothing for the user to sign in to (and muster refuses a manual logout).
 */
function SsoExplanation({ text }: { text: string }) {
  const classes = useStyles();
  return (
    <Text
      as="p"
      variant="body-small"
      color="secondary"
      className={classes.fullRow}
    >
      {text}
    </Text>
  );
}

/**
 * The wait of a sign-in this tab started, or `undefined` when there is none:
 * what the flow says beside its way back into the sign-in page.
 */
export type SignInWait = { clientIdNote?: ClientIdNote };

function signInWait(
  state: ServerSignInState,
  noun: SignInNoun,
): SignInWait | undefined {
  if (!state.isWaiting) {
    return undefined;
  }
  const clientIdNote = clientIdMethodNote(state.clientIdMethod, noun);
  return clientIdNote ? { clientIdNote } : {};
}

/**
 * What {@link ServerAuthActions} shows for a server, decided once, so every
 * layout of it (inline sentences, or a status with a tooltip) follows the
 * same rules:
 *
 * - `sso`: an SSO-managed server (token forwarding/exchange) muster asks to
 *   act on, or whose automatic connection failed: an explanation, no button.
 *   It never waits on a sign-in, since there is nothing to sign in to.
 * - `sign-in`: muster reports a sign-in is needed, or one this tab started is
 *   outstanding. `gate` withholds it with a reason; `wait` is the outstanding
 *   flow.
 * - `sign-out`: a per-user OAuth server that is connected.
 * - `none`: nothing asks anything of the person.
 */
export type AuthActionParts =
  | { kind: 'none' }
  | { kind: 'sso'; explanation: string }
  | { kind: 'sign-in'; gate?: string; wait?: SignInWait }
  | { kind: 'sign-out' };

export function authActionParts(
  serverName: string,
  state: ServerSignInState,
  options: { noun: SignInNoun; oauthConfigured?: boolean; signInGate?: string },
): AuthActionParts {
  const { noun, oauthConfigured, signInGate } = options;
  if (state.isSsoManaged) {
    // `sso_attempt_failed` names a concrete misconfiguration; a healthy (or
    // merely pending) SSO server explains itself only when muster asks the
    // user to act, which for SSO it normally never does.
    return state.needsLogin || state.status?.sso_attempt_failed
      ? {
          kind: 'sso',
          explanation: ssoExplanationText(serverName, state, noun),
        }
      : { kind: 'none' };
  }
  // `isWaiting` keeps the row alive while a sign-in this tab started is
  // outstanding, whatever the polled status currently claims -- and whether or
  // not the URL muster issued for it is still on offer.
  if (state.needsLogin || state.isWaiting) {
    if (signInGate) {
      return { kind: 'sign-in', gate: signInGate };
    }
    const wait = signInWait(state, noun);
    return wait ? { kind: 'sign-in', wait } : { kind: 'sign-in' };
  }
  if (oauthConfigured && state.isConnected) {
    return { kind: 'sign-out' };
  }
  return { kind: 'none' };
}

/**
 * The sign-in affordance: a button that asks muster for a sign-in URL
 * (`core_auth_login`) and opens it directly in a new tab -- completing the
 * flow there connects the server for this muster session and the surrounding
 * content unblocks on its own (see {@link useServerSignIn}). While the flow is
 * outstanding this renders the wait, with a way back into the sign-in page:
 *
 * - Tab already open (closed it, lost it behind others): a quiet "Reopen"
 *   button that asks muster for a FRESH challenge. Not a link to the URL
 *   muster issued earlier -- the state behind that expires after 10 minutes,
 *   well inside the wait, and a reopened stale URL lands on "Authentication
 *   session expired" (observed live, four clicks in a row).
 * - Popup blocked: the URL itself is the only way in, so it is a prominent
 *   link -- for as long as muster honours it. Once the hook withdraws it, the
 *   link gives way to a button requesting a fresh URL (which, with popups
 *   still blocked, renders as a fresh link).
 */
export function SignInFlow({
  state,
  prominent,
  noun,
  compact,
}: {
  state: ServerSignInState;
  noun: SignInNoun;
  /**
   * Primary styling. On the MCP servers page the sign-in is the single action
   * an auth-gated server needs, so it outranks the secondary lifecycle
   * buttons sharing its row.
   */
  prominent?: boolean;
  /**
   * The buttons alone, for a status cell: the wait and the notes are said by
   * the status beside them (`ServerSignInStatus`).
   */
  compact?: boolean;
}) {
  const classes = useStyles();
  const { authUrl, isPending, signIn, signInTabOpened } = state;
  const wait = signInWait(state, noun);

  if (!wait) {
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

  const waiting = compact ? null : (
    <Text variant="body-small" color="secondary">
      {WAITING_FOR_SIGN_IN}
    </Text>
  );

  let wayIn;
  if (signInTabOpened) {
    wayIn = (
      <>
        {waiting}
        <Button
          variant="tertiary"
          size="small"
          isPending={isPending}
          onClick={signIn}
        >
          {isPending ? 'Reopening…' : 'Reopen sign-in page'}
        </Button>
      </>
    );
  } else if (authUrl) {
    wayIn = (
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
        {waiting}
      </>
    );
  } else {
    wayIn = (
      <>
        <Button
          variant={prominent ? 'primary' : 'secondary'}
          size="small"
          isPending={isPending}
          onClick={signIn}
        >
          {isPending ? 'Opening…' : 'Open sign-in page'}
        </Button>
        {waiting}
      </>
    );
  }

  const clientIdNote = compact ? undefined : wait.clientIdNote;
  return (
    <>
      {wayIn}
      {clientIdNote ? (
        <Text
          variant="body-small"
          color={clientIdNote.color}
          className={classes.fullRow}
        >
          {clientIdNote.text}
        </Text>
      ) : null}
    </>
  );
}

/**
 * The sign-in affordance disabled with the reason, for a server the portal
 * knows a sign-in cannot help right now. Kept in place rather than dropped so
 * the row still says where the sign-in went -- the same shape as the gated
 * Reconnect in the lifecycle row.
 */
export function GatedSignIn({ reason }: { reason: string }) {
  return (
    <DisabledAction reason={reason}>
      {describedBy => (
        <Button
          variant="primary"
          size="small"
          isDisabled
          aria-describedby={describedBy}
        >
          Sign in
        </Button>
      )}
    </DisabledAction>
  );
}

export interface ServerSignInProps {
  /** The muster server name, as reported by `list_tools` / `auth://status`. */
  serverName: string;
  installation?: string;
  /** Show the server name next to the action (a list of several servers). */
  showName?: boolean;
  /**
   * What the copy calls the server: main's "server" by default (the classic
   * portal, e.g. Bot PRs), "connector" in the agent platform's own sections.
   */
  noun?: SignInNoun;
}

/**
 * The always-rendered "Sign in" affordance for one OAuth-protected aggregated
 * MCP server, for surfaces that already know the server is auth-gated (the
 * new-server verify page). The MCP servers page
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
  noun = 'server',
}: ServerSignInProps) {
  const classes = useStyles();
  const state = useServerSignIn(serverName, installation, { noun });

  if (state.isSsoManaged) {
    return (
      <div className={classes.root}>
        <SsoExplanation text={ssoExplanationText(serverName, state, noun)} />
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
      <SignInFlow state={state} noun={noun} />
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
  /**
   * Why the sign-in is withheld right now, when it is. With a reason set, a
   * server muster reports as needing a sign-in gets a disabled "Sign in" that
   * explains itself instead of the live flow; "Sign out" is unaffected, since
   * revoking a stale grant is exactly what a gated server may still need.
   */
  signInGate?: string;
  /** What the copy calls the server: main's "server" by default. */
  noun?: SignInNoun;
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
  signInGate,
  noun = 'server',
}: ServerAuthActionsProps) {
  const classes = useStyles();
  const state = useServerSignIn(serverName, installation, { noun });
  const parts = authActionParts(serverName, state, {
    noun,
    oauthConfigured,
    signInGate,
  });
  const name = showName ? (
    <code className={classes.name}>{serverName}</code>
  ) : null;

  switch (parts.kind) {
    case 'sso':
      return (
        <div className={classes.inActionRow}>
          <SsoExplanation text={parts.explanation} />
          <Messages state={state} />
        </div>
      );
    case 'sign-in':
      return (
        <div className={classes.inActionRow}>
          {name}
          {parts.gate ? (
            <GatedSignIn reason={parts.gate} />
          ) : (
            <SignInFlow state={state} prominent noun={noun} />
          )}
          <Messages state={state} />
        </div>
      );
    case 'sign-out':
      return (
        <div className={classes.inActionRow}>
          {name}
          <Button
            variant="secondary"
            size="small"
            isPending={state.isSigningOut}
            onClick={state.signOut}
          >
            {state.isSigningOut ? 'Signing out…' : 'Sign out'}
          </Button>
          <Messages state={state} />
        </div>
      );
    default:
      // Idle deliberately ignores `error`/`note`: they are the answer to a
      // click, which by definition happened on a row that was already
      // visible, so letting them defeat the gate would pin an unrelated row
      // open (they also do not survive a remount, unlike the pending entry).
      return null;
  }
}
