import type { ReactNode } from 'react';
import { makeStyles, Theme } from '@material-ui/core';
import {
  InfoHint,
  StatusDot,
  type StatusDotProps,
} from '@giantswarm/backstage-plugin-ui-react';
import {
  type AuthActionParts,
  authActionParts,
  GatedSignIn,
  SignInFlow,
  WAITING_FOR_SIGN_IN,
} from '../ServerSignIn';
import {
  type ServerSignInState,
  type SignInNoun,
  useServerSignIn,
} from '../useServerSignIn';

const useStyles = makeStyles((theme: Theme) => ({
  // A status cell: the state, then the sign-in. The state never shrinks, so
  // in a narrow cell the button wraps under it instead of cutting the label.
  cell: {
    display: 'inline-flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.spacing(1),
    minWidth: 0,
  },
  status: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: theme.spacing(0.5),
    flex: 'none',
  },
}));

/** A state as a list shows it: a dot and a few words. */
export type StatusLabel = Required<Pick<StatusDotProps, 'tone'>> & {
  label: string;
};

/**
 * The state shown for a server with a sign-in: an error first, since it
 * answers the person's last click ("Could not sign in", also while a sign-in
 * is outstanding: a refused reopen, an unreadable status); then "Signing in…"
 * while a sign-in page is open, in the warning tone when the authorization
 * server may reject muster as an unregistered client; else the row's own.
 */
function shownStatus(
  status: StatusLabel,
  parts: AuthActionParts,
  state: ServerSignInState,
): StatusLabel {
  if (parts.kind === 'none') {
    return status;
  }
  if (state.error) {
    return { label: 'Could not sign in', tone: 'danger' };
  }
  if (parts.kind === 'sign-in' && parts.wait) {
    return {
      label: 'Signing in…',
      tone: parts.wait.clientIdNote?.color === 'warning' ? 'warning' : 'info',
    };
  }
  return status;
}

/**
 * Everything `ServerAuthActions` says in sentences, for the tooltip of a
 * status that shows a few words instead.
 */
function statusDetails(
  parts: AuthActionParts,
  state: ServerSignInState,
): string[] {
  if (parts.kind === 'none') {
    return [];
  }
  const details: string[] = [];
  if (parts.kind === 'sso') {
    details.push(parts.explanation);
  }
  if (parts.kind === 'sign-in' && parts.wait) {
    details.push(WAITING_FOR_SIGN_IN);
    if (parts.wait.clientIdNote) {
      details.push(parts.wait.clientIdNote.text);
    }
  }
  if (state.note) {
    details.push(state.note);
  }
  if (state.error) {
    details.push(state.error);
  }
  return details;
}

export interface ServerSignInStatusProps {
  /** The muster server name, as reported by `auth://status`. */
  serverName: string;
  installation?: string;
  /** The row's own state, shown while no sign-in from this tab overrides it. */
  status: StatusLabel;
  /**
   * Why the sign-in is withheld right now, when it is: a disabled "Sign in"
   * that explains itself (see `ServerAuthActions`).
   */
  signInGate?: string;
  /** What the copy calls the server: main's "server" by default. */
  noun?: SignInNoun;
}

/**
 * A server's state and sign-in for a list row, as two parts: `status`, a dot
 * and a few words that always fit, with the explanation in an
 * {@link InfoHint} beside them; and `actions`, the bare sign-in buttons, or
 * `null`. The same rules as `ServerAuthActions` (`authActionParts`), whose
 * sentences would crowd the state out of a table cell. One hook call per row,
 * so the answer to a click on the button reaches the status.
 */
export function useServerSignInStatus({
  serverName,
  installation,
  status,
  signInGate,
  noun = 'server',
}: ServerSignInStatusProps): { status: ReactNode; actions: ReactNode } {
  const state = useServerSignIn(serverName, installation, { noun });
  const parts = authActionParts(serverName, state, { noun, signInGate });
  const shown = shownStatus(status, parts, state);
  const details = statusDetails(parts, state);

  let actions: ReactNode = null;
  if (parts.kind === 'sign-in') {
    actions = parts.gate ? (
      <GatedSignIn reason={parts.gate} />
    ) : (
      <SignInFlow state={state} noun={noun} prominent compact />
    );
  }
  return {
    status: (
      <StatusWithHint
        serverName={serverName}
        status={shown}
        details={details}
      />
    ),
    actions,
  };
}

function StatusWithHint({
  serverName,
  status,
  details,
}: {
  serverName: string;
  status: StatusLabel;
  details: string[];
}) {
  const classes = useStyles();
  return (
    <span className={classes.status}>
      <StatusDot tone={status.tone} label={status.label} />
      {details.length > 0 ? (
        <InfoHint label={`About the state of ${serverName}`} size="medium">
          {details.join('\n')}
        </InfoHint>
      ) : null}
    </span>
  );
}

/**
 * {@link useServerSignInStatus}'s two parts side by side, for a table's
 * status cell.
 */
export function ServerSignInStatus(props: ServerSignInStatusProps) {
  const classes = useStyles();
  const { status, actions } = useServerSignInStatus(props);
  return (
    <span className={classes.cell}>
      {status}
      {actions}
    </span>
  );
}
