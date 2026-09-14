import { Tab, TabList, Tabs } from '@backstage/ui';
import { useSplatBasePath } from '@giantswarm/backstage-plugin-ui-react';

/**
 * The tabs, in reading order: what the agent is, what it can reach, what it
 * knows, what it has been used for. Overview is the index — its path is empty —
 * so the three-segment URL every link in the portal already points at keeps
 * rendering the agent without a redirect.
 */
const TABS = [
  { path: '', title: 'Overview' },
  { path: 'tools', title: 'Tools' },
  { path: 'skills', title: 'Skills' },
  { path: 'sessions', title: 'Sessions' },
] as const;

/**
 * The detail page's tab strip: navigation links whose active state follows the
 * route, with the content driven by the page's router rather than by TabPanels —
 * the same shape as the second-level tab rows in ModelsRouter and UsageRouter.
 *
 * Unlike those, this strip needs no `px` of its own: it renders inside the page's
 * `<Content>`, which already applies the gutter they have to reproduce by hand.
 */
export function AgentDetailTabs() {
  const basePath = useSplatBasePath();

  return (
    <Tabs>
      <TabList>
        {TABS.map(tab => (
          <Tab
            key={tab.path}
            id={tab.path}
            // Absolute: a relative bui href inside a splat route resolves against
            // the whole pathname and appends, so from `/…/name/tools` a relative
            // "skills" would land on `/…/name/tools/skills`.
            href={tab.path ? `${basePath}/${tab.path}` : basePath}
            // Overview's href is the base path — a prefix of every other tab's —
            // so the default 'exact' is what keeps it from staying highlighted
            // everywhere. The others need 'prefix' only in as much as they may
            // grow sub-routes later; today they match exactly either way.
            matchStrategy={tab.path ? 'prefix' : 'exact'}
          >
            {tab.title}
          </Tab>
        ))}
      </TabList>
    </Tabs>
  );
}
