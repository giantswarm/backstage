import { Box, makeStyles } from '@material-ui/core';

const useStyles = makeStyles(() => ({
  root: {
    overflowX: 'auto',
    width: '100%',
  },
}));

export const ScrollContainer = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const classes = useStyles();

  return <Box className={classes.root}>{children}</Box>;
};
