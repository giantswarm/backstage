import { makeStyles } from '@material-ui/core';

/**
 * A friendly label's colour (`gs.friendlyLabels` / `gs.friendlyAnnotations`
 * `variant`) as one of bui's tints: its key on the tint, its value plain.
 */
const TINTS: Record<string, { bg: string; fg: string }> = {
  green: { bg: 'var(--bui-bg-success)', fg: 'var(--bui-fg-success-on-bg)' },
  blue: { bg: 'var(--bui-bg-info)', fg: 'var(--bui-fg-info-on-bg)' },
  orange: { bg: 'var(--bui-bg-warning)', fg: 'var(--bui-fg-warning-on-bg)' },
  yellow: { bg: 'var(--bui-bg-warning)', fg: 'var(--bui-fg-warning-on-bg)' },
  red: { bg: 'var(--bui-bg-danger)', fg: 'var(--bui-fg-danger-on-bg)' },
};
const NEUTRAL = {
  bg: 'var(--bui-bg-neutral-2)',
  fg: 'var(--bui-fg-secondary)',
};

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
    minHeight: 26,
    maxWidth: '100%',
    borderRadius: 'var(--bui-radius-3)',
    overflow: 'hidden',
    fontSize: 'var(--bui-font-size-2)',
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
      {items.map(item => {
        const tint = (item.variant && TINTS[item.variant]) || NEUTRAL;
        return (
          <li
            key={`${item.key}=${item.value}`}
            className={classes.pair}
            style={{ borderColor: tint.bg }}
          >
            <span
              className={classes.part}
              style={{ background: tint.bg, color: tint.fg }}
            >
              {item.key}
            </span>
            <span className={classes.part}>{item.value}</span>
          </li>
        );
      })}
    </ul>
  );
}
