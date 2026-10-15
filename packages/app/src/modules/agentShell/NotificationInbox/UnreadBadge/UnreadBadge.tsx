import { makeStyles } from '@material-ui/core/styles';

/** Past this the badge says "99+": the exact number no longer helps. */
const MAX_SHOWN = 99;

const useStyles = makeStyles({
  badge: {
    position: 'absolute',
    top: -4,
    right: -6,
    minWidth: 18,
    height: 18,
    padding: '0 5px',
    boxSizing: 'border-box',
    borderRadius: 9,
    background: 'var(--agent-shell-unread-badge-bg, var(--bui-fg-negative))',
    color: 'var(--agent-shell-unread-badge-fg, #fff)',
    // A ring in the rail's colour keeps it apart from the icon under it.
    boxShadow: '0 0 0 2px var(--agent-shell-rail-bg, var(--bui-bg-neutral-1))',
    fontSize: 11,
    lineHeight: '18px',
    fontWeight: 700,
    textAlign: 'center',
    pointerEvents: 'none',
  },
});

/**
 * The red unread count on the bell and on the phone bar's Profile item.
 * Positioned against its nearest positioned ancestor's top right corner;
 * renders nothing at zero. Decoration only: the control it sits on carries
 * the count in its accessible name.
 */
export function UnreadBadge({ count }: { count: number }) {
  const classes = useStyles();
  if (count <= 0) {
    return null;
  }
  return (
    <span aria-hidden="true" className={classes.badge}>
      {count > MAX_SHOWN ? `${MAX_SHOWN}+` : count}
    </span>
  );
}

/** The accessible name of a control that carries the badge. */
export function withUnreadCount(name: string, count: number): string {
  return count > 0 ? `${name}, ${count} unread` : name;
}
