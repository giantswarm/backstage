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

const HeadingH1 = withStyles(
  () => ({
    root: {
      fontSize: '2rem',
    },
  }),
  { name: 'HeadingH1' },
)(HeadingBase) as typeof Typography;

const HeadingH2 = withStyles(
  () => ({
    root: {
      fontSize: '1.5rem',
    },
  }),
  { name: 'HeadingH2' },
)(HeadingBase) as typeof Typography;

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
    case 'h1':
      return <HeadingH1 component="h1" {...props} />;
    case 'h2':
      return <HeadingH2 component="h2" {...props} />;
    case 'h3':
      return <HeadingH3 component="h3" {...props} />;
    case 'h4':
      return <HeadingH4 component="h4" {...props} />;
    default:
      return <HeadingBase {...props} />;
  }
};
