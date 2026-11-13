import { makeStyles, Theme } from '@material-ui/core';
import { StatusDot, StatusHint } from '@giantswarm/backstage-plugin-ui-react';
import { type ServerSignInStatusState, type StatusText } from '../hooks';
import { GatedSignIn, SignInFlow } from '../ServerSignIn';

const useStyles = makeStyles((theme: Theme) => ({
  status: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: theme.spacing(0.5),
    flex: 'none',
  },
}));

/**
 * A state as a list or a header shows it: a dot and a few words that never
 * shrink, with the sentences that say why in a {@link StatusHint} beside them
 * where there are any.
 */
export function StatusWithHint({
  tone,
  label,
  subject,
  explanation,
  title,
}: StatusText & {
  /** What the hint calls the state's owner: its display name, where it has one. */
  subject: string;
  explanation?: string | readonly string[];
  /** A native tooltip on the dot and its words, apart from the hint's. */
  title?: string;
}) {
  const classes = useStyles();
  return (
    <span className={classes.status}>
      <span title={title}>
        <StatusDot tone={tone} label={label} />
      </span>
      <StatusHint subject={subject} explanation={explanation} />
    </span>
  );
}

/** The state in a few words, with the sentences in a {@link StatusHint}. */
export function SignInStatusText({
  serverName,
  signInStatus: { shown, details },
}: {
  /** What the hint calls the server: its display name, where it has one. */
  serverName: string;
  signInStatus: ServerSignInStatusState;
}) {
  return (
    <StatusWithHint
      tone={shown.tone}
      label={shown.label}
      subject={serverName}
      explanation={details}
    />
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
