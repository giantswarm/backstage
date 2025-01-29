import { ComponentProps, ComponentType } from 'react';
import CachingColorHash from '../../utils/cachingColorHash';
import { styled } from '@material-ui/core';

const colorHash = new CachingColorHash();

type ColorWrapperProps = {
  str: string;
};

export const ColorWrapper = styled('div')(({ theme, str }) => {
  const backgroundColor = colorHash.calculateColor(str);
  return {
    display: 'inline-block',
    padding: `0 ${theme.spacing(1)}px`,
    borderRadius: theme.shape.borderRadius,
    backgroundColor,
    color: theme.palette.getContrastText(backgroundColor),
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
    lineHeight: '24px',
  };
}) as ComponentType<ComponentProps<'div'> & ColorWrapperProps>;
