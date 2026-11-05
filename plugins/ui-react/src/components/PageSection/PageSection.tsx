import { ReactNode, useId } from 'react';
import { makeStyles } from '@material-ui/core';
import { SectionHeader } from '../SectionHeader';

const useStyles = makeStyles({
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--bui-space-3)',
  },
  head: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 'var(--bui-space-2)',
  },
});

export type PageSectionProps = {
  /** The section's `h2`, which also names its region. */
  title: string;
  /** A sentence under the heading. */
  description?: ReactNode;
  /** A control at the heading's end, e.g. a link to the full list. */
  action?: ReactNode;
  children: ReactNode;
};

/**
 * A section of a detail page's tab: a small `h2` heading (`title-x-small`),
 * optionally a sentence and an action beside it, then the content, spaced by
 * one gap. The region takes its name from the heading. Used by the agent,
 * skill and workflow pages' Overview tabs.
 */
export function PageSection({
  title,
  description,
  action,
  children,
}: PageSectionProps) {
  const classes = useStyles();
  const headingId = useId();
  const header = (
    <SectionHeader
      as="h2"
      variant="title-x-small"
      title={title}
      description={description}
      id={headingId}
      compact
    />
  );
  return (
    <section className={classes.section} aria-labelledby={headingId}>
      {action ? (
        <div className={classes.head}>
          {header}
          {action}
        </div>
      ) : (
        header
      )}
      {children}
    </section>
  );
}
