import type { ReactNode } from 'react';
import { makeStyles } from '@material-ui/core';
import { Fact, FactList } from '../FactList';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--bui-space-4)',
    minWidth: 0,
    // 12px is the portal's smallest text. bui sets `body-x-small` and its
    // small badges and tags in this token, 10px; in the column it is the
    // captions' 12px, whatever a value renders.
    '--bui-font-size-1': 'var(--bui-font-size-2)',
  },
});

export interface FactsColumnProps {
  facts: Fact[];
  /** Rendered below the facts, e.g. a link to edit them. */
  children?: ReactNode;
  /** Names the column's landmark. Defaults to "Details". */
  'aria-label'?: string;
}

/**
 * The narrow column of facts beside a detail page's content: each label a
 * muted caption over its value, separated by hairline rules. Meant for
 * `ShellPage`'s `aside`. No text in it is set below 12px, not even a value's
 * `body-x-small` line.
 */
export function FactsColumn({
  facts,
  children,
  'aria-label': ariaLabel = 'Details',
}: FactsColumnProps) {
  const classes = useStyles();
  return (
    <aside aria-label={ariaLabel} className={classes.root}>
      <FactList facts={facts} stacked maxWidth={null} />
      {children}
    </aside>
  );
}
