import { ReactNode } from 'react';
import { makeStyles } from '@material-ui/core';
import { TECHNICAL_DETAILS_TITLE_INSET } from '../TechnicalDetailsFoldOut';

const useStyles = makeStyles({
  section: {
    paddingInline: TECHNICAL_DETAILS_TITLE_INSET,
  },
});

export type FoldOutAlignedSectionProps = {
  /** The region's accessible name, e.g. "Model details". */
  'aria-label': string;
  children: ReactNode;
};

/**
 * A region above a `TechnicalDetailsFoldOut`, inset as the fold-out insets
 * its title, so its content (a detail page's plain facts) lines up with it
 * instead of starting at the content's edge, left of it and of the tabs'
 * labels. The connector and workflow pages' Details tabs and the model page's
 * Overview use it.
 */
export function FoldOutAlignedSection({
  'aria-label': label,
  children,
}: FoldOutAlignedSectionProps) {
  const classes = useStyles();
  return (
    <section aria-label={label} className={classes.section}>
      {children}
    </section>
  );
}
