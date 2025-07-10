import { ReactNode } from 'react';
import classNames from 'classnames';
import { Box, makeStyles, Theme } from '@material-ui/core';
import { ColorVariant, makeColorVariants } from '../colors/makeColorVariants';

const palette = makeColorVariants();

const useStyles = makeStyles<Theme, { variant: ColorVariant }>(theme => {
  const colors = palette[theme.palette.type];

  return {
    root: {
      display: 'inline-flex',
      padding: `${theme.spacing(0.5)}px ${theme.spacing(1)}px`,
      backgroundColor: props => colors[props.variant].backgroundColor,
      borderRadius: theme.shape.borderRadius,
    },
  };
});

type ChipProps = {
  variant: ColorVariant;
  label: ReactNode;
};

export const Chip = ({ label, variant }: ChipProps) => {
  const classes = useStyles({ variant });

  return <Box className={classNames(classes.root)}>{label}</Box>;
};
