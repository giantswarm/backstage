import { ReactNode } from 'react';
import { makeStyles } from '@material-ui/core';

const useStyles = makeStyles({
  navItemIcon: {
    display: 'inline-flex',
    '& > svg': {
      fontSize: '1.25rem',
    },
  },
});

export const NavItemIcon = ({ children }: { children: ReactNode }) => {
  const classes = useStyles();
  return <span className={classes.navItemIcon}>{children}</span>;
};
