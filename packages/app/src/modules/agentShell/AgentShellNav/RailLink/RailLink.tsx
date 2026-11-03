import { useLocation } from 'react-router-dom';
import { Flex, Link, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core/styles';
import type { AgentShellNavItem } from '../../navItems';
import { type RailLayout, useBarItemStyles } from '../railLayout';

const useStyles = makeStyles({
  link: {
    display: 'block',
    padding: 'var(--bui-space-2)',
    borderRadius: 'var(--bui-radius-2)',
    color: 'var(--bui-fg-primary)',
    textDecoration: 'none',
    whiteSpace: 'nowrap',
    '&:hover': {
      background: 'var(--agent-shell-rail-item-hover, var(--bui-bg-neutral-2))',
      textDecoration: 'none',
    },
  },
  // The bar, not the background, is what tells the current item apart: the
  // shell's active background is close to the rail's own.
  active: {
    background: 'var(--agent-shell-rail-item-active, var(--bui-bg-neutral-3))',
    boxShadow: [
      'inset 3px 0 0 var(--agent-shell-rail-item-active-bar, var(--bui-ring))',
      '0 0 0 1px var(--agent-shell-rail-item-active-border, transparent)',
    ].join(', '),
  },
});

/**
 * Whether the item is the current one: its own page, or any page below it —
 * the URL tree follows the rail, so every page of a destination lives under
 * its path (giantswarm/giantswarm#38510). New session (`/`) only on itself.
 */
function isActivePath(pathname: string, href: string): boolean {
  if (href === '/') {
    return pathname === '/';
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function RailLink({
  item,
  href,
  layout,
}: {
  item: AgentShellNavItem;
  href: string;
  layout: RailLayout;
}) {
  const classes = useStyles();
  const barClasses = useBarItemStyles();
  const { pathname } = useLocation();
  const isActive = isActivePath(pathname, href);
  const Icon = item.icon;

  if (layout === 'bar') {
    // The phone's bottom bar: the icon over a short visible label — a phone
    // shows no `title` — with the current item marked along the top edge.
    return (
      <li className={barClasses.slot}>
        <Link
          href={href}
          target={item.newTab ? '_blank' : undefined}
          className={barClasses.item}
          aria-current={isActive ? 'page' : undefined}
        >
          <Icon fontSize="small" />
          <span className={barClasses.label}>
            {item.barTitle ?? item.title}
          </span>
        </Link>
      </li>
    );
  }

  const compact = layout === 'collapsed';
  return (
    <li>
      <Link
        href={href}
        target={item.newTab ? '_blank' : undefined}
        className={`${classes.link} ${isActive ? classes.active : ''}`}
        aria-current={isActive ? 'page' : undefined}
        aria-label={compact ? item.title : undefined}
        title={compact ? item.title : undefined}
      >
        <Flex align="center" gap="2">
          <Icon fontSize="small" />
          {!compact && <Text variant="body-medium">{item.title}</Text>}
        </Flex>
      </Link>
    </li>
  );
}
