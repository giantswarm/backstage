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
  // Exclusions are marked by outline, strike-through *and* the word "except"
  // beside them — never by colour alone, and never sharing the include styling,
  // since confusing the two inverts the meaning of the constraint.
  exclude: {
    background: 'transparent',
    color: 'var(--bui-fg-secondary)',
    border: '1px dashed var(--bui-border-2)',
    textDecoration: 'line-through',
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
