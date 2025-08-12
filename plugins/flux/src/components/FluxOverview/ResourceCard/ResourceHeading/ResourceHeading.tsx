import { Box, makeStyles, Typography } from '@material-ui/core';
import classNames from 'classnames';
import MiddleEllipsis from 'react-middle-ellipsis';

const useStyles = makeStyles(theme => ({
  heading: {
    margin: 0,
  },
  headingInactive: {
    color: theme.palette.type === 'light' ? '#444' : '#909090',
  },
}));

type ResourceHeadingProps = {
  name: string;
  inactive?: boolean;
  nowrap?: boolean;
};

export const ResourceHeading = ({
  name,
  inactive,
  nowrap = false,
}: ResourceHeadingProps) => {
  const classes = useStyles();

  return nowrap ? (
    <Box flexGrow={1} whiteSpace="nowrap" overflow="hidden">
      <Typography
        variant="h6"
        className={classNames(classes.heading, {
          [classes.headingInactive]: inactive,
        })}
      >
        <MiddleEllipsis>
          <span title={name}>{name}</span>
        </MiddleEllipsis>
      </Typography>
    </Box>
  ) : (
    <Typography
      variant="h6"
      className={classNames(classes.heading, {
        [classes.headingInactive]: inactive,
      })}
    >
      {name}
    </Typography>
  );
};
