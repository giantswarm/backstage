import type { AgentShellNavItem } from '../../navItems';
import { ProfileMenu } from '../ProfileMenu';
import { RailLink } from '../RailLink';
import { RouteRailLink } from '../RouteRailLink';

export function RailItem({
  item,
  compact,
}: {
  item: AgentShellNavItem;
  compact: boolean;
}) {
  if ('routeRef' in item) {
    return (
      <RouteRailLink item={item} routeRef={item.routeRef} compact={compact} />
    );
  }
  if ('path' in item) {
    return <RailLink item={item} href={item.path} compact={compact} />;
  }
  return (
    <li>
      <ProfileMenu item={item} compact={compact} />
    </li>
  );
}
