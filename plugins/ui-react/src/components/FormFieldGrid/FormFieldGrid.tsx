import type { ReactNode } from 'react';
import { makeStyles } from '@material-ui/core';
import { TWO_COLUMN_MEDIA } from '../../utils/breakpoints';

const useStyles = makeStyles({
  root: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr)',
    columnGap: 'var(--bui-space-4)',
    // The space between fields is each field's own bottom margin (below), so
    // the grid's rows can be the fields' inner rows with nothing between them.
    // The last row's margin is taken back here, so the grid adds no space
    // under itself that a `Grid` with `gap` did not.
    rowGap: 0,
    marginBottom: 'calc(-1 * var(--bui-space-4))',
    // Every field spans three rows of this grid -- its label (with the
    // description under it), its control and its error -- and lays its own
    // parts onto them through `subgrid`. So a label row is as tall as the
    // tallest label in that row of fields, and every input in the row starts
    // on the same line however long the descriptions above them run. bui's
    // fields space those parts with margins (label wrapper, error), not
    // `gap`, which is what lets them sit on shared tracks unchanged.
    //
    // `&&` doubles the class: a hand-rolled field's own JSS `display`/`gap`
    // has the same specificity and would otherwise win by stylesheet order.
    // A browser without subgrid drops the declaration and stacks each field's
    // parts as before -- unaligned, never broken.
    '&& > *': {
      display: 'grid',
      gridRow: 'span 3',
      gridTemplateRows: 'subgrid',
      rowGap: 0,
      marginBottom: 'var(--bui-space-4)',
    },
  },
  // The portal's two-column tier, bui's `sm` (768px): where its `Grid`
  // switched these forms to two columns before, so the layout changes at the
  // same width it always did.
  twoColumns: {
    [TWO_COLUMN_MEDIA]: {
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    },
  },
});

export type FormFieldGridProps = {
  /**
   * The fields, as direct children: bui `TextField`s, `Select`s and fields
   * built the same way (label wrapper, control, error). Not wrapped — the
   * alignment needs each field's own parts on the grid's rows.
   */
  children: ReactNode;
  /**
   * Columns from bui's `sm` breakpoint up; one column below it either way.
   * Defaults to 2.
   */
  columns?: 1 | 2;
};

/**
 * Form fields side by side whose inputs line up across the row regardless of
 * how long each field's label or description is -- the layout a two-column
 * `Grid` of fields gets wrong as soon as one description wraps to a second
 * line and pushes its input down. One column below bui's `sm` breakpoint.
 */
export function FormFieldGrid({ children, columns = 2 }: FormFieldGridProps) {
  const classes = useStyles();
  return (
    <div
      className={
        columns === 2 ? `${classes.root} ${classes.twoColumns}` : classes.root
      }
    >
      {children}
    </div>
  );
}
