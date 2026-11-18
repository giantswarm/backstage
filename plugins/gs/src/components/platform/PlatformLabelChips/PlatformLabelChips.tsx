import { makeStyles } from '@material-ui/core';

/**
 * A friendly label's colour (`gs.friendlyLabels` / `gs.friendlyAnnotations`
 * `variant`) as one of bui's tints, behind the key. The key's text is the
 * primary text colour on every tint, which holds at least 10.7:1 in the
 * light theme and 8.1:1 in the dark one.
 */
const TINTS: Record<string, string> = {
  green: 'var(--bui-positive-bg-subdued)',
  blue: 'var(--bui-announcement-bg-subdued)',
  orange: 'var(--bui-warning-bg-subdued)',
  yellow: 'var(--bui-warning-bg-subdued)',
  red: 'var(--bui-negative-bg-subdued)',
};
const NEUTRAL = 'var(--bui-bg-neutral-2)';

const useStyles = makeStyles({
  list: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 'var(--bui-space-2)',
    margin: 0,
    padding: 0,
    listStyle: 'none',
  },
  pair: {
    display: 'inline-flex',
    alignItems: 'stretch',
    minHeight: 28,
    maxWidth: '100%',
    borderRadius: 'var(--bui-radius-3)',
    overflow: 'hidden',
    fontSize: 'var(--bui-font-size-3)',
    color: 'var(--bui-fg-primary)',
    border: '1px solid',
  },
  part: {
    display: 'inline-flex',
    alignItems: 'center',
    paddingInline: 'var(--bui-space-2)',
    overflowWrap: 'anywhere',
  },
});

export type LabelChip = {
  key: string;
  value: string;
  /** The friendly configuration's colour name. */
  variant?: string;
};

/**
 * Friendly labels and annotations as key and value chips, the key on its
 * configured tint.
 */
export function PlatformLabelChips({
  items,
  'aria-label': ariaLabel,
}: {
  items: LabelChip[];
  'aria-label': string;
}) {
  const classes = useStyles();
  return (
    <ul className={classes.list} aria-label={ariaLabel}>
      {items.map((item, index) => {
        const tint = (item.variant && TINTS[item.variant]) || NEUTRAL;
        return (
          <li
            // A label and an annotation can format alike.
            key={`${index}:${item.key}=${item.value}`}
            className={classes.pair}
            style={{ borderColor: tint }}
          >
            <span className={classes.part} style={{ background: tint }}>
              {item.key}
            </span>
            <span className={classes.part}>{item.value}</span>
          </li>
        );
      })}
    </ul>
  );
}
