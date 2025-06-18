import { Grid, GridProps, makeStyles } from '@material-ui/core';
import classNames from 'classnames';

const useStyles = makeStyles(() => ({
  hiddenIfEmpty: {
    '&:empty': {
      display: 'none',
    },
  },
}));

export const GridItem = ({
  children,
  item,
  className,
  ...props
}: GridProps) => {
  const classes = useStyles();

  return (
    <Grid
      item
      className={classNames(className, classes.hiddenIfEmpty)}
      {...props}
    >
      {children}
    </Grid>
  );
};
