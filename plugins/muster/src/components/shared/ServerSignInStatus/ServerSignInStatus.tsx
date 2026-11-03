import { makeStyles, Theme } from '@material-ui/core';
import { StatusDot, StatusHint } from '@giantswarm/backstage-plugin-ui-react';
import {
  type ServerSignInStatusState,
  type UseServerSignInStatusOptions,
  useServerSignInStatus,
} from '../hooks';
import { GatedSignIn, SignInFlow } from '../ServerSignIn';

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

/** The state in a few words, with the sentences in a {@link StatusHint}. */
export function SignInStatusText({
  serverName,
  signInStatus: { shown, details },
}: {
  /** What the hint calls the server: its display name, where it has one. */
  serverName: string;
  signInStatus: ServerSignInStatusState;
}) {
  const classes = useStyles();
  return (
    <span className={classes.status}>
      <StatusDot tone={shown.tone} label={shown.label} />
      <StatusHint subject={serverName} explanation={details} />
    </span>
  );
}

/** The bare sign-in buttons, or nothing where there is no sign-in. */
export function SignInStatusActions({
  signInStatus: { parts, state },
}: {
  signInStatus: ServerSignInStatusState;
}) {
  if (parts.kind !== 'sign-in') {
    return null;
  }
  return parts.gate ? (
    <GatedSignIn reason={parts.gate} />
  ) : (
    <SignInFlow state={state} wait={parts.wait} prominent compact />
  );
}

export type ServerSignInStatusProps = UseServerSignInStatusOptions;

/**
 * A server's state and sign-in side by side, for a table's status cell: a
 * dot and a few words that always fit, the explanation in a tooltip, and the
 * bare sign-in buttons. The same rules as `ServerAuthActions`, whose
 * sentences would crowd the state out of the cell.
 */
export function ServerSignInStatus(props: ServerSignInStatusProps) {
  const classes = useStyles();
  const signInStatus = useServerSignInStatus(props);
  return (
    <span className={classes.cell}>
      <SignInStatusText
        serverName={props.displayName ?? props.serverName}
        signInStatus={signInStatus}
      />
      <SignInStatusActions signInStatus={signInStatus} />
    </span>
  );
}
