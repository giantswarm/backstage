import { ReactNode } from 'react';
import { Box, makeStyles, Typography } from '@material-ui/core';

const useStyles = makeStyles(theme => ({
  root: {
    marginBottom: theme.spacing(4),

    '&:last-child': {
      marginBottom: 0,
    },
  },
  heading: {
    marginBottom: theme.spacing(1),
  },
}));

type SectionProps = {
  heading: string;
  children: ReactNode;
};

export const Section = ({ heading, children }: SectionProps) => {
  const classes = useStyles();
  return (
    <Box className={classes.root}>
      <Typography variant="h6" className={classes.heading}>
        {heading}
      </Typography>

      {children}
    </Box>
  );
};
