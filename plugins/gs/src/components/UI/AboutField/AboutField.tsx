import { useElementFilter } from '@backstage/core-plugin-api';
import { Grid } from '@material-ui/core';
import Typography from '@material-ui/core/Typography';
import { makeStyles } from '@material-ui/core/styles';
import { ReactNode } from 'react';

const useStyles = makeStyles(theme => ({
  value: {
    fontWeight: 'bold',
    overflow: 'hidden',
    lineHeight: '24px',
    wordBreak: 'break-word',
  },
  label: {
    color: theme.palette.text.secondary,
    textTransform: 'uppercase',
    fontSize: '10px',
    fontWeight: 'bold',
    letterSpacing: 0.5,
    overflow: 'hidden',
    whiteSpace: 'nowrap',
  },
}));

export interface AboutFieldProps {
  label: string;
  value?: string;
  gridSizes?: Record<string, number>;
  children?: ReactNode;
  className?: string;
}

export function AboutField(props: AboutFieldProps) {
  const { label, value, gridSizes, children, className } = props;
  const classes = useStyles();

  const childElements = useElementFilter(children, c => c.getElements());

  // Content is either children or a string prop `value`
  const content =
    childElements.length > 0 ? (
      childElements
    ) : (
      <Typography variant="body2" className={classes.value}>
        {value}
      </Typography>
    );

  return (
    <Grid item {...gridSizes} className={className}>
      <Typography variant="h2" className={classes.label}>
        {label}
      </Typography>
      {content}
    </Grid>
  );
}
