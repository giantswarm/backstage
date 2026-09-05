import { type ReactNode } from 'react';
import { makeStyles } from '@material-ui/core';

const useStyles = makeStyles({
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    height: 18,
    padding: '0 var(--bui-space-2)',
    borderRadius: 'var(--bui-radius-2)',
    fontSize: 'var(--bui-font-size-2)',
    lineHeight: 1,
    whiteSpace: 'nowrap',
  },
  include: {
    background: 'var(--bui-bg-neutral-2)',
    color: 'var(--bui-fg-primary)',
    border: '1px solid transparent',
  },
  // The "any except" prefix carries the meaning, so the chip only needs to look
  // distinct from an inclusion — no strike-through, which hurt legibility of the
  // very values a reader needs to identify.
  exclude: {
    background: 'transparent',
    color: 'var(--bui-fg-secondary)',
    border: '1px dashed var(--bui-border-2)',
  },
});

interface ChipProps {
  variant?: 'include' | 'exclude';
  children: ReactNode;
}

export const Chip = ({ variant = 'include', children }: ChipProps) => {
  const classes = useStyles();
  return (
    <span className={`${classes.base} ${classes[variant]}`}>{children}</span>
  );
};
