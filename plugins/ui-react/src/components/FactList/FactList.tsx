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
  stackedList: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr)',
    maxWidth: ({ maxWidth }: StyleProps) => maxWidth ?? 'none',
    margin: 0,
    '& > dd:last-of-type': {
      borderBottom: 'none',
    },
  },
  stackedLabel: {
    margin: 0,
    paddingTop: 'var(--bui-space-3)',
  },
  stackedValue: {
    margin: 0,
    minWidth: 0,
    paddingTop: 'var(--bui-space-1)',
    paddingBottom: 'var(--bui-space-3)',
    borderBottom: '1px solid var(--bui-border-1)',
    overflowWrap: 'anywhere',
  },
});

export interface Fact {
  label: string;
  /**
   * A string or a number is wrapped in `body-small` text; anything else
   * renders as given.
   */
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
  /**
   * Each label above its value, a muted caption over the value, for a narrow
   * column such as a detail page's facts column. `labelWidth` does not apply.
   * Defaults to false: label and value side by side.
   */
  stacked?: boolean;
}

/**
 * Numbers are wrapped as well as strings: a caller pushing a count would
 * otherwise get the surrounding typography for that one row, a size and family
 * apart from its neighbours.
 */
function FactValue({ value }: { value: ReactNode }) {
  return typeof value === 'string' || typeof value === 'number' ? (
    <Text variant="body-small">{value}</Text>
  ) : (
    <>{value}</>
  );
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
  stacked = false,
}: FactListProps) => {
  const classes = useStyles({
    labelWidth,
    maxWidth: maxWidth ?? undefined,
  });

  if (stacked) {
    return (
      <dl className={classes.stackedList}>
        {facts.map(fact => (
          <Fragment key={fact.label}>
            <dt className={classes.stackedLabel}>
              <Text variant="body-small" color="secondary">
                {fact.label}
              </Text>
            </dt>
            <dd className={classes.stackedValue}>
              <FactValue value={fact.value} />
            </dd>
          </Fragment>
        ))}
      </dl>
    );
  }

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
            <FactValue value={fact.value} />
          </dd>
        </Fragment>
      ))}
    </dl>
  );
};
