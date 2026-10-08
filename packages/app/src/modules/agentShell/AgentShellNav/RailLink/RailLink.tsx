import { useLocation } from 'react-router-dom';
import { Flex, Link, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core/styles';
import type { AgentShellNavItem } from '../../navItems';

const useStyles = makeStyles({
  link: {
    display: 'block',
    padding: 'var(--bui-space-2)',
    borderRadius: 'var(--bui-radius-2)',
    color: 'var(--bui-fg-primary)',
    textDecoration: 'none',
    whiteSpace: 'nowrap',
    '&:hover': {
      background: 'var(--bui-bg-neutral-2)',
      textDecoration: 'none',
    },
  },
  active: {
    background: 'var(--bui-bg-neutral-3)',
  },
});

function isActivePath(pathname: string, href: string): boolean {
  if (href === '/') {
    return pathname === '/';
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function RailLink({
  item,
  href,
  compact,
}: {
  item: AgentShellNavItem;
  href: string;
  compact: boolean;
}) {
  const classes = useStyles();
  const { pathname } = useLocation();
  const isActive = isActivePath(pathname, href);
  const Icon = item.icon;
  return (
    <li>
      <Link
        href={href}
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
