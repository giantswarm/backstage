import { useLocation, useParams } from 'react-router-dom';
import type { PageLayoutProps } from '@backstage/frontend-plugin-api';
import { PluginHeader } from '@backstage/ui';
import type { HeaderTab } from '@backstage/ui';
import {
  PageHeaderActionsProvider,
  usePageHeaderActionsSlot,
} from '@giantswarm/backstage-plugin-ui-react';

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
 *
 * The layout also hosts a page-header-actions slot (`PageHeaderActionsProvider`
 * + `useProvidePageHeaderActions`), so routed tab content can inject
 * context-specific header buttons — e.g. the agent-platform create flow's
 * Cancel / Review buttons — into this single header instead of rendering a
 * second header of its own.
 */
export function GSPageLayout(props: PageLayoutProps) {
  // Pages that render their own header (clusters/deployments/ai-chat/home)
  // opt out; skip the header (and its actions slot) entirely for them.
  if (props.noHeader) {
    return <>{props.children}</>;
  }

  return (
    <PageHeaderActionsProvider>
      <PageLayoutWithHeader {...props} />
    </PageHeaderActionsProvider>
  );
}

function PageLayoutWithHeader(props: PageLayoutProps) {
  const { title, icon, titleLink, headerActions, tabs, children } = props;

  const { pathname } = useLocation();
  const params = useParams();

  // Actions injected by the active routed content (if any) take precedence over
  // the page's static header actions.
  const dynamicActions = usePageHeaderActionsSlot();

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
        customActions={dynamicActions ?? headerActions}
        tabs={headerTabs}
      />
      {children}
    </>
  );
}
