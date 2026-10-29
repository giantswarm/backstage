import { makeStyles } from '@material-ui/core/styles';
import type { AgentShellNavItem } from '../../navItems';
import { NotificationBell } from '../../NotificationInbox';
import { ProfileMenu } from '../ProfileMenu';
import { RailLink } from '../RailLink';
import { RouteRailLink } from '../RouteRailLink';
import { type RailLayout, useBarItemStyles } from '../railLayout';

const useStyles = makeStyles({
  // The pinned rail's Profile row: the Profile trigger, the bell to its right.
  profileRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--bui-space-1)',
    '& > :first-child': {
      flex: '1 1 auto',
      minWidth: 0,
    },
  },
});

export function RailItem({
  item,
  layout,
  menuItems,
}: {
  item: AgentShellNavItem;
  layout: RailLayout;
  /** For the Profile menu: the items that moved into it (phone bar, T22 D1). */
  menuItems?: AgentShellNavItem[];
}) {
  const barClasses = useBarItemStyles();
  const classes = useStyles();
  if ('routeRef' in item) {
    return (
      <RouteRailLink item={item} routeRef={item.routeRef} layout={layout} />
    );
  }
  if ('path' in item) {
    return <RailLink item={item} href={item.path} layout={layout} />;
  }
  // The Notification inbox's bell sits on the Profile row: to its right in
  // the pinned rail, above the avatar in the collapsed one. The phone's bar
  // has no room for it; its Profile item carries the badge instead.
  if (layout === 'bar') {
    return (
      <li className={barClasses.slot}>
        <ProfileMenu item={item} layout={layout} menuItems={menuItems} />
      </li>
    );
  }
  if (layout === 'collapsed') {
    return (
      <>
        <li>
          <NotificationBell />
        </li>
        <li>
          <ProfileMenu item={item} layout={layout} menuItems={menuItems} />
        </li>
      </>
    );
  }
  return (
    <li className={classes.profileRow}>
      <ProfileMenu item={item} layout={layout} menuItems={menuItems} />
      <NotificationBell />
    </li>
  );
}
