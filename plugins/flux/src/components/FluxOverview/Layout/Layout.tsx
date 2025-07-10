import { ReactNode } from 'react';
import { Grid, makeStyles } from '@material-ui/core';

const useStyles = makeStyles(() => ({
  details: {
    height: '100vh',
    position: 'sticky',
    top: 0,
  },
}));

type LayoutProps = {
  content: ReactNode;
  details: ReactNode;
};

export const Layout = ({ content, details }: LayoutProps) => {
  const classes = useStyles();

  return (
    <Grid container spacing={3} alignItems="flex-start">
      <Grid item xs={12} lg={6}>
        {content}
      </Grid>
      <Grid item xs={12} lg={6} className={classes.details}>
        {details}
      </Grid>
    </Grid>
  );
};
