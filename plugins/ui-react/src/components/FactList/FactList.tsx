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
    columnGap: 'var(--bui-space-6)',
    rowGap: 'var(--bui-space-2)',
    // Keeps a label on the same line as a value whose first line is taller
    // than text (a chip row, a bar).
    alignItems: 'baseline',
    // <dl> carries a default block margin.
    margin: 0,
    [`@media (max-width: ${NARROW_BREAKPOINT}px)`]: {
      gridTemplateColumns: '1fr',
      rowGap: 'var(--bui-space-1)',
    },
  },
  label: {
    margin: 0,
  },
  value: {
    // <dd> carries a default inline-start margin.
    margin: 0,
    minWidth: 0,
    overflowWrap: 'anywhere',
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
 * A compact list of label/value pairs laid out as horizontal rows.
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
          <dt className={classes.label}>
            <Text variant="body-small" color="secondary">
              {fact.label}
            </Text>
          </dt>
          <dd className={classes.value}>
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
