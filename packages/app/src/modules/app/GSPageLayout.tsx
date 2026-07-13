import { useLocation, useParams } from 'react-router-dom';
import type { PageLayoutProps } from '@backstage/frontend-plugin-api';
import { PluginHeader } from '@backstage/ui';
import type { HeaderTab } from '@backstage/ui';

/**
 * Custom implementation of the NFS `PageLayout` swappable component, rendered
 * via the bui `PluginHeader` (matching the clusters/deployments sections and
 * the `useLayoutTabs` hook in the `gs` plugin).
 *
 * `PageBlueprint` uses this component to render the header of every page. When
 * a page has sub-pages (`SubPageBlueprint`), it also passes them as `tabs`.
 * Without this override the app falls back to the upstream stub `PageLayout`,
 * which renders tabs as plain relative `<a href="list">` anchors with no active
 * state — so from `/flux/list` clicking "Tree view" navigates to
 * `/flux/list/tree` (append) instead of `/flux/tree`, and no tab is ever
 * highlighted. Turning the relative sub-page paths into absolute hrefs here
 * fixes both.
 */
export function GSPageLayout(props: PageLayoutProps) {
  const { title, icon, noHeader, titleLink, headerActions, tabs, children } =
    props;

  const { pathname } = useLocation();
  const params = useParams();

  // Pages that render their own header (clusters/deployments/ai-chat/home)
  // opt out; skip the tab/base-path work entirely for them.
  if (noHeader) {
    return <>{children}</>;
  }

  // The page is mounted at a splat route (e.g. `/flux/*`), so the base path is
  // the current pathname with the matched remainder removed. Work by path
  // *segment* rather than string length: `location.pathname` stays
  // percent-encoded while `useParams()['*']` is decoded, so comparing lengths
  // would break on encoded chars — but the `/` separator count is unaffected.
  const splatSegments = (params['*'] ?? '').split('/').filter(Boolean).length;
  const segments = pathname.split('/').filter(Boolean);
  const basePath = `/${segments
    .slice(0, Math.max(0, segments.length - splatSegments))
    .join('/')}`;

  const headerTabs: HeaderTab[] | undefined = tabs?.map(tab => {
    const cleanPath = tab.href.replace(/^\//, '');
    return {
      id: tab.id,
      label: tab.label,
      href: cleanPath ? `${basePath}/${cleanPath}` : basePath,
      // Keep the tab active for nested sub-routes (e.g. muster's
      // `workflows/:id`); the sub-page paths here never prefix one another.
      matchStrategy: 'prefix',
    };
  });

  return (
    <>
      <PluginHeader
        title={title}
        icon={icon}
        titleLink={titleLink}
        customActions={headerActions}
        tabs={headerTabs}
      />
      {children}
    </>
  );
}
