import { useState } from 'react';
import { makeStyles } from '@material-ui/core';
import { Mono } from '@giantswarm/backstage-plugin-ui-react';

const useStyles = makeStyles({
  list: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 'var(--bui-space-2)',
    margin: 0,
    padding: 0,
    listStyle: 'none',
  },
  tag: {
    display: 'inline-flex',
    alignItems: 'center',
    minHeight: 22,
    maxWidth: '100%',
    paddingInline: 'var(--bui-space-2)',
    borderRadius: 'var(--bui-radius-3)',
    background: 'var(--bui-bg-neutral-2)',
    color: 'var(--bui-fg-secondary)',
    fontSize: 'var(--bui-font-size-2)',
    overflowWrap: 'anywhere',
  },
  more: {
    border: 0,
    font: 'inherit',
    cursor: 'pointer',
  },
});

/** How many raw entries a chip row shows before "+N". */
export const RAW_CHIPS_SHOWN = 3;

/**
 * Raw `key=value` entries as monospace chips: the first few, then a "+N"
 * chip that shows the rest.
 */
export function PlatformRawChips({
  entries,
  'aria-label': ariaLabel,
}: {
  entries: Record<string, string>;
  'aria-label': string;
}) {
  const classes = useStyles();
  const [all, setAll] = useState(false);
  const lines = Object.entries(entries).map(([key, value]) =>
    value ? `${key}=${value}` : key,
  );
  const shown = all ? lines : lines.slice(0, RAW_CHIPS_SHOWN);
  const hidden = lines.length - shown.length;
  return (
    <ul className={classes.list} aria-label={ariaLabel}>
      {shown.map(line => (
        <li key={line} className={classes.tag}>
          <Mono>{line}</Mono>
        </li>
      ))}
      {hidden > 0 && (
        <li>
          <button
            type="button"
            className={`${classes.tag} ${classes.more}`}
            aria-label={`Show ${hidden} more`}
            onClick={() => setAll(true)}
          >
            +{hidden}
          </button>
        </li>
      )}
    </ul>
  );
}
