import { Fragment, type ReactNode } from 'react';
import { Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';

const NARROW_BREAKPOINT = 520;

type StyleProps = {
  labelWidth: number;
  maxWidth: number | undefined;
};

const useStyles = makeStyles({
  list: {
    display: 'grid',
    // The label column is capped rather than proportional: a percentage track
    // pushes values far from their labels once the container is wide, which is
    // what makes a label/value list stop reading as pairs.
    gridTemplateColumns: ({ labelWidth }: StyleProps) =>
      `minmax(120px, ${labelWidth}px) minmax(0, 1fr)`,
    maxWidth: ({ maxWidth }: StyleProps) => maxWidth ?? 'none',
    // No column gap: the gutter is padding on the label cell instead, so each
    // row's rule runs unbroken across both columns. No row gap either — rows
    // are separated by the cells' own bottom rules.
    //
    // Cells must STRETCH to the row height (the grid default) so both bottom
    // rules land on the row's bottom edge. `align-items: baseline` sizes each
    // cell to its own content, which steps the rule wherever a value runs to
    // more lines than its label. Content top-aligns instead, which puts a
    // label level with the first line of its value anyway.
    // <dl> carries a default block margin.
    margin: 0,
    // Rules separate items, so the final row closes against whatever contains
    // the list rather than leaving a dangling hairline.
    '& > dt:last-of-type, & > dd:last-of-type': {
      borderBottom: 'none',
    },
    [`@media (max-width: ${NARROW_BREAKPOINT}px)`]: {
      gridTemplateColumns: '1fr',
    },
  },
  cell: {
    margin: 0,
    minWidth: 0,
    paddingTop: 'var(--bui-space-2)',
    paddingBottom: 'var(--bui-space-2)',
    borderBottom: '1px solid var(--bui-border-1)',
  },
  label: {
    paddingRight: 'var(--bui-space-6)',
  },
  value: {
    overflowWrap: 'anywhere',
  },
  // Stacked, a label and its value are one row, so only the value closes it.
  narrowStacked: {
    [`@media (max-width: ${NARROW_BREAKPOINT}px)`]: {
      borderBottom: 'none',
      paddingBottom: 0,
    },
  },
});

export interface Fact {
  label: string;
  /** A string is wrapped in `body-small` text; anything else renders as given. */
  value: ReactNode;
}

export interface FactListProps {
  facts: Fact[];
  /** Upper bound of the label column, in px. Defaults to 180. */
  labelWidth?: number;
  /**
   * Upper bound of the whole list, in px, to hold a readable measure in a wide
   * container. Pass `null` to fill the container. Defaults to 720.
   */
  maxWidth?: number | null;
}

/**
 * A compact list of label/value pairs laid out as horizontal rows, separated
 * by hairline rules.
 *
 * Rendered as a definition list, so the pairing is conveyed to assistive
 * technology rather than only visually. Use `ContentRow` instead where a label
 * stacked *above* its value suits the surrounding layout better.
 */
export const FactList = ({
  facts,
  labelWidth = 180,
  maxWidth = 720,
}: FactListProps) => {
  const classes = useStyles({
    labelWidth,
    maxWidth: maxWidth ?? undefined,
  });

  return (
    <dl className={classes.list}>
      {facts.map(fact => (
        <Fragment key={fact.label}>
          <dt
            className={`${classes.cell} ${classes.label} ${classes.narrowStacked}`}
          >
            <Text variant="body-small" weight="bold">
              {fact.label}
            </Text>
          </dt>
          <dd className={`${classes.cell} ${classes.value}`}>
            {typeof fact.value === 'string' ? (
              <Text variant="body-small">{fact.value}</Text>
            ) : (
              fact.value
            )}
          </dd>
        </Fragment>
      ))}
    </dl>
  );
};
