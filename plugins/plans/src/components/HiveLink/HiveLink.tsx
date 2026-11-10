import type { ReactNode } from 'react';
import { Link } from '@backstage/ui';
import { ExternalLink } from '@giantswarm/backstage-plugin-ui-react';
import { isPortalPath } from '../../lib/magazine';

/**
 * A link from the magazine: a portal path stays in the tab; anything outside
 * the portal (GitHub, a plan's site) is an `ExternalLink`, which opens a new
 * tab and says so.
 */
export function HiveLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return isPortalPath(href) ? (
    <Link href={href}>{children}</Link>
  ) : (
    <ExternalLink href={href} variant="body-medium">
      {children}
    </ExternalLink>
  );
}
