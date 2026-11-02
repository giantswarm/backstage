import type { ReactNode } from 'react';
import { makeStyles } from '@material-ui/core';
import { Fact, FactList } from '../FactList';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--bui-space-4)',
    minWidth: 0,
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
 * `ShellPage`'s `aside`.
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
