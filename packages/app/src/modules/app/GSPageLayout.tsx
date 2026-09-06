import type { PageLayoutProps } from '@backstage/frontend-plugin-api';
import { PluginHeader } from '@backstage/ui';
import type { HeaderTab } from '@backstage/ui';
import {
  PageHeaderActionsProvider,
  usePageHeaderActionsSlot,
  useSplatBasePath,
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

  // Two kinds of actions share the header's action area. The page's own
  // (`PluginHeaderActionBlueprint`, e.g. the Agent Platform's installation
  // scope selector) are controls that belong to the whole section and stay put
  // while the tabs change; the ones injected by the active routed content
  // (`useProvidePageHeaderActions`, e.g. a tab's "New agent" button) come and
  // go with it. Both render, the page's first: a section-wide control must
  // not vanish because a tab registered a button.
  const dynamicActions = usePageHeaderActionsSlot();
  const staticActions = headerActions?.filter(Boolean) ?? [];
  const customActions =
    staticActions.length > 0 || dynamicActions
      ? [...staticActions, dynamicActions]
      : undefined;

  // The page is mounted at a splat route (e.g. `/flux/*`); resolve its base path
  // so the sub-page tab hrefs below are absolute.
  const basePath = useSplatBasePath();

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
        customActions={customActions}
        tabs={headerTabs}
      />
      {children}
    </>
  );
}
