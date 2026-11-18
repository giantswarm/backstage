import type { ReactNode } from 'react';
import { makeStyles } from '@material-ui/core';
import { Link } from '@backstage/ui';
import { NewTabHint } from '@giantswarm/backstage-plugin-ui-react';

const useStyles = makeStyles({
  // The design's tool tile: a 44px bordered row, the icon, the label taking
  // the room, the launch icon at the far end. A control rather than a text
  // link, so no underline (`standalone`).
  tile: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--bui-space-2)',
    minHeight: 44,
    paddingInline: 'var(--bui-space-3)',
    border: '1px solid var(--bui-border-1)',
    borderRadius: 'var(--agent-shell-input-radius, var(--bui-radius-3))',
    background: 'var(--bui-bg-neutral-1)',
    color: 'var(--bui-fg-primary)',
    fontSize: 'var(--bui-font-size-3)',
    fontWeight: 'var(--bui-font-weight-bold)' as unknown as number,
    textDecoration: 'none',
    '&:hover': {
      borderColor: 'var(--bui-border-2)',
    },
    '& > svg:last-of-type': {
      flex: 'none',
    },
  },
  icon: {
    display: 'inline-flex',
    flex: 'none',
    fontSize: 18,
  },
  label: {
    flex: 1,
    minWidth: 0,
    overflowWrap: 'anywhere',
  },
});

export type PlatformToolTileProps = {
  href: string;
  /** An 18px icon before the label. */
  icon: ReactNode;
  children: ReactNode;
};

/**
 * A link to a tool outside the portal, drawn as the design's tile: the icon,
 * the label, and at the tile's end the launch icon that says it opens in a
 * new tab, so a long label wraps without leaving the launch icon behind.
 */
export function PlatformToolTile({
  href,
  icon,
  children,
}: PlatformToolTileProps) {
  const classes = useStyles();
  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      standalone
      className={classes.tile}
    >
      <span aria-hidden className={classes.icon}>
        {icon}
      </span>
      <span className={classes.label}>{children}</span>
      <NewTabHint />
    </Link>
  );
}
