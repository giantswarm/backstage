import { makeStyles, Theme } from '@material-ui/core';
import { Text } from '@backstage/ui';
import type { ProviderAppAuthStatus } from '../../apis';
import {
  ProviderAppSignIn,
  providerAppHint,
  providerAppLabel,
} from './ProviderAppSignIn';

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

export type ProviderAppListProps = {
  /** The provider Apps, as muster lists them in `auth://status`. */
  apps: ProviderAppAuthStatus[];
  /** The muster installation that keeps the person's grants. */
  installation?: string;
};

/**
 * A row per provider App: what it is called, what connecting it is for, and
 * {@link ProviderAppSignIn} with its state and action.
 */
export function ProviderAppList({ apps, installation }: ProviderAppListProps) {
  const classes = useStyles();
  return (
    <ul className={classes.list} aria-label="Connections">
      {apps.map(app => (
        <li key={app.name} className={classes.row}>
          <span className={classes.label}>
            <span className={classes.name}>{providerAppLabel(app.name)}</span>
            {providerAppHint(app.name) && (
              <Text variant="body-small" color="secondary">
                {providerAppHint(app.name)}
              </Text>
            )}
          </span>
          <ProviderAppSignIn app={app.name} installation={installation} />
        </li>
      ))}
    </ul>
  );
}
