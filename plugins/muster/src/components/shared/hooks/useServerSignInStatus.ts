import type { StatusDotProps } from '@giantswarm/backstage-plugin-ui-react';
import {
  type AuthActionParts,
  authActionParts,
  WAITING_FOR_SIGN_IN,
} from '../ServerSignIn';
import {
  type ServerSignInState,
  type SignInNoun,
  useServerSignIn,
} from '../useServerSignIn';

/** A state as a list shows it: a dot and a few words. */
export type StatusText = Required<Pick<StatusDotProps, 'tone'>> & {
  label: string;
};

export interface UseServerSignInStatusOptions {
  /** The muster server name, as reported by `auth://status`. */
  serverName: string;
  installation?: string;
  /** The row's own state, shown while no sign-in from this tab overrides it. */
  status: StatusText;
  /**
   * Why the sign-in is withheld right now, when it is: a disabled "Sign in"
   * that explains itself (see `ServerAuthActions`).
   */
  signInGate?: string;
  /** What the copy calls the server: main's "server" by default. */
  noun?: SignInNoun;
}

export interface ServerSignInStatusState {
  /** The state to show: the row's own, or what the sign-in says over it. */
  shown: StatusText;
  /** The sentences `ServerAuthActions` would print, for a tooltip. */
  details: string[];
  /** What applies to the server, from {@link authActionParts}. */
  parts: AuthActionParts;
  /** The sign-in itself, for its buttons. */
  state: ServerSignInState;
}

/**
 * The state shown for a server with a sign-in, most pressing first:
 *
 * - "Could not sign in" (danger): muster refused the last click, or its
 *   request was lost. Also while a sign-in is outstanding (a refused reopen).
 * - "Status unavailable" (warning): `auth://status` cannot be read while a
 *   sign-in is outstanding, so nobody can tell whether it finished. The
 *   sign-in itself may well still be going, so it is not called failed.
 * - "Signing in…": a sign-in page is open; in the warning tone when the
 *   authorization server may reject muster as an unregistered client.
 * - Else the row's own state.
 */
function shownStatus(
  status: StatusText,
  parts: AuthActionParts,
  state: ServerSignInState,
): StatusText {
  if (parts.kind === 'none') {
    return status;
  }
  // `error` carries the unreadable status too, unless a click's answer
  // outranks it.
  if (state.error && state.error !== state.statusUnreadable) {
    return { label: 'Could not sign in', tone: 'danger' };
  }
  if (state.statusUnreadable) {
    return { label: 'Status unavailable', tone: 'warning' };
  }
  if (parts.kind === 'sign-in' && parts.wait) {
    return {
      label: 'Signing in…',
      tone: parts.wait.clientIdNote?.color === 'warning' ? 'warning' : 'info',
    };
  }
  return status;
}

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

/**
 * A server's state and sign-in for a list row, decided by the same rules as
 * `ServerAuthActions` ({@link authActionParts}): a few words that always fit,
 * the sentences for a tooltip, and the parts for the buttons. One call per
 * row, so the answer to a click on the button reaches the state; render it
 * with `SignInStatusText` and `SignInStatusActions`.
 */
export function useServerSignInStatus({
  serverName,
  installation,
  status,
  signInGate,
  noun = 'server',
}: UseServerSignInStatusOptions): ServerSignInStatusState {
  const state = useServerSignIn(serverName, installation, { noun });
  const parts = authActionParts(serverName, state, { noun, signInGate });
  return {
    shown: shownStatus(status, parts, state),
    details: statusDetails(parts, state),
    parts,
    state,
  };
}
