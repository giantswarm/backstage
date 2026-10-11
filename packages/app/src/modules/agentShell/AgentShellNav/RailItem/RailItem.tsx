import type { AgentShellNavItem } from '../../navItems';
import { ProfileMenu } from '../ProfileMenu';
import { RailLink } from '../RailLink';
import { RouteRailLink } from '../RouteRailLink';
import { type RailLayout, useBarItemStyles } from '../railLayout';

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
  if ('routeRef' in item) {
    return (
      <RouteRailLink item={item} routeRef={item.routeRef} layout={layout} />
    );
  }
  if ('path' in item) {
    return <RailLink item={item} href={item.path} layout={layout} />;
  }
  return (
    <li className={layout === 'bar' ? barClasses.slot : undefined}>
      <ProfileMenu item={item} layout={layout} menuItems={menuItems} />
    </li>
  );
}
