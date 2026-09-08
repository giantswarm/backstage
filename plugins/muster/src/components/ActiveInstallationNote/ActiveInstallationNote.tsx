import { Typography, makeStyles, Theme } from '@material-ui/core';
import { ALL_INSTALLATIONS } from '@giantswarm/backstage-plugin-gs';
import {
  useMusterInstance,
  type MusterInstance,
} from '../MusterInstanceProvider';

const useStyles = makeStyles((theme: Theme) => ({
  note: {
    marginBottom: theme.spacing(2),
  },
}));

/**
 * The one line that explains which muster a view shows when that is not what
 * the page header's installation selector says -- exported for tests.
 *
 * - Under "All installations" the section shows one muster (the home
 *   installation's, or the first one that runs muster): say which, and where
 *   to switch.
 * - A pinned installation that runs no muster the portal knows (or a stale
 *   deep link) resolves to the same default: say so, or the header names one
 *   installation while the page shows another.
 *
 * Nothing to say while the list is loading, when the selector's choice is the
 * muster shown, when no muster is known at all (the views have their own empty
 * state), and on a portal that knows one installation: there the header shows
 * no selector and the section behaves as it always did.
 */
export function describeActiveInstallation({
  scope,
  activeInstallation,
  homeInstallation,
  isSingleInstallation,
  isLoadingInstallations,
}: Pick<
  MusterInstance,
  | 'scope'
  | 'activeInstallation'
  | 'homeInstallation'
  | 'isSingleInstallation'
  | 'isLoadingInstallations'
>): string | undefined {
  if (isLoadingInstallations || isSingleInstallation || !activeInstallation) {
    return undefined;
  }
  if (scope === ALL_INSTALLATIONS) {
    const home =
      activeInstallation === homeInstallation ? ' (the home installation)' : '';
    return `One muster at a time: showing ${activeInstallation}${home}. Pin an installation in the page header to see another.`;
  }
  if (scope !== activeInstallation) {
    return `No muster is known on ${scope}; showing ${activeInstallation} instead.`;
  }
  return undefined;
}

export type ActiveInstallationNoteProps = {
  className?: string;
};

/**
 * Where the muster views used to carry an installation picker of their own:
 * the Agent Platform page header's selector is the one control that scopes
 * the section now, and this renders only when its choice and the muster shown
 * differ (see {@link describeActiveInstallation}).
 */
export const ActiveInstallationNote = ({
  className,
}: ActiveInstallationNoteProps) => {
  const classes = useStyles();
  const instance = useMusterInstance();
  const note = describeActiveInstallation(instance);

  if (!note) {
    return null;
  }

  return (
    <Typography
      variant="body2"
      color="textSecondary"
      className={className ?? classes.note}
    >
      {note}
    </Typography>
  );
};
