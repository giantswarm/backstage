import { makeStyles, Typography } from '@material-ui/core';
import classNames from 'classnames';

const useStyles = makeStyles(theme => ({
  root: {
    textOverflow: 'ellipsis',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    width: '100%',
    margin: 0,
  },
  rootInactive: {
    color: theme.palette.type === 'light' ? '#444' : '#909090',
  },
}));

type ResourceHeadingProps = {
  name: string;
  inactive?: boolean;
};

export const ResourceHeading = ({ name, inactive }: ResourceHeadingProps) => {
  const classes = useStyles();

  return (
    <Typography
      variant="h6"
      className={classNames(classes.root, {
        [classes.rootInactive]: inactive,
      })}
    >
      {name}
    </Typography>
  );
};
