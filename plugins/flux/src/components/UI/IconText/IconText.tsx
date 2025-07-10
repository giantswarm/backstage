import { Box, makeStyles, SvgIcon, Theme, Tooltip } from '@material-ui/core';
import { ReactNode } from 'react';

const useStyles = makeStyles((theme: Theme) => ({
  root: {
    display: 'inline-flex',
    alignItems: 'center',
    textDecoration: 'inherit',
  },
  icon: {
    marginRight: theme.spacing(0.5),
    '& svg': {
      verticalAlign: 'middle',
    },
  },
}));

type IconTextProps = {
  icon: typeof SvgIcon;
  iconTooltip?: string;
  children: ReactNode;
};

export const IconText = ({
  icon: Icon,
  iconTooltip,
  children,
}: IconTextProps) => {
  const classes = useStyles();

  const el = (
    <Box component="span" className={classes.icon}>
      <Icon fontSize="inherit" />
    </Box>
  );

  return (
    <Box component="span" className={classes.root}>
      {iconTooltip ? <Tooltip title={iconTooltip}>{el}</Tooltip> : el}

      {children}
    </Box>
  );
};
