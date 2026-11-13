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
  // A status with room for less than its label: the words wrap, the hint
  // stays beside them.
  statusWrapping: {
    flex: '0 1 auto',
    minWidth: 0,
  },
  // Buttons whose label may wrap: centred in a button that grows to hold
  // it. bui's content box is `height: 100%`, which an auto height voids.
  actionsWrapping: {
    display: 'flex',
    minWidth: 0,
    maxWidth: '100%',
    '& .bui-Button': {
      flexShrink: 1,
      minWidth: 0,
      height: 'auto',
      minHeight: '2rem',
      alignItems: 'center',
      paddingBlock: theme.spacing(0.5),
    },
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
  wrap,
}: StatusText & {
  /** What the hint calls the state's owner: its display name, where it has one. */
  subject: string;
  explanation?: string | readonly string[];
  /** A native tooltip on the dot and its words, apart from the hint's. */
  title?: string;
  /** Wrap the words where they do not fit, rather than overflow. */
  wrap?: boolean;
}) {
  const classes = useStyles();
  return (
    <span
      className={
        wrap ? `${classes.status} ${classes.statusWrapping}` : classes.status
      }
    >
      <span title={title} style={wrap ? { minWidth: 0 } : undefined}>
        <StatusDot tone={tone} label={label} wrap={wrap} />
      </span>
      <StatusHint subject={subject} explanation={explanation} />
    </span>
  );
}

/** The state in a few words, with the sentences in a {@link StatusHint}. */
export function SignInStatusText({
  serverName,
  signInStatus: { shown, details },
  wrap,
}: {
  /** What the hint calls the server: its display name, where it has one. */
  serverName: string;
  signInStatus: ServerSignInStatusState;
  /** Wrap the words where they do not fit, rather than overflow. */
  wrap?: boolean;
}) {
  return (
    <StatusWithHint
      tone={shown.tone}
      label={shown.label}
      subject={serverName}
      explanation={details}
      wrap={wrap}
    />
  );
}

/** The bare sign-in buttons, or nothing where there is no sign-in. */
export function SignInStatusActions({
  signInStatus: { parts, state },
  wrap,
}: {
  signInStatus: ServerSignInStatusState;
  /**
   * Let a label wider than the space it has ("Open sign-in page") wrap
   * inside its button rather than be cut off or push its neighbours aside.
   */
  wrap?: boolean;
}) {
  const classes = useStyles();
  if (parts.kind !== 'sign-in') {
    return null;
  }
  const buttons = parts.gate ? (
    <GatedSignIn reason={parts.gate} />
  ) : (
    <SignInFlow state={state} wait={parts.wait} prominent compact />
  );
  return wrap ? (
    <span className={classes.actionsWrapping}>{buttons}</span>
  ) : (
    buttons
  );
}
