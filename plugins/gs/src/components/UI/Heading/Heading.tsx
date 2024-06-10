import React from 'react';
import { Typography, withStyles } from '@material-ui/core';

const HeadingBase = withStyles(
  theme => ({
    root: {
      ...theme.typography.h6,
      marginTop: 0,
      marginBottom: 0,
    },
  }),
  { name: 'Heading' },
)(Typography) as typeof Typography;

const HeadingH3 = withStyles(
  () => ({
    root: {
      fontSize: '1.125rem',
    },
  }),
  { name: 'HeadingH3' },
)(HeadingBase) as typeof Typography;

const HeadingH4 = withStyles(
  () => ({
    root: {
      fontSize: '1rem',
    },
  }),
  { name: 'HeadingH4' },
)(HeadingBase) as typeof Typography;

type HeadingProps = {
  level: 'h1' | 'h2' | 'h3' | 'h4';
  children?: React.ReactNode;
};

export const Heading = ({ level, ...props }: HeadingProps) => {
  switch (level) {
    case 'h3':
      return <HeadingH3 component="h3" {...props} />;
    case 'h4':
      return <HeadingH4 component="h4" {...props} />;
    default:
      return <HeadingBase {...props} />;
  }
};
