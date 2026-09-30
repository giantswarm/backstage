import { Tab, TabList, Tabs } from '@backstage/ui';
import { useSplatBasePath } from '@giantswarm/backstage-plugin-ui-react';

export interface ServerPageTabSpec {
  id: string;
  /** The tab's path segment; empty for Overview, the index. */
  path: string;
  title: string;
  /** Shown after the title where muster reports one; absent is not zero. */
  count?: number;
}

/**
 * The server page's tab strip: navigation links whose active state follows the
 * route, the content driven by the page's router -- the agent detail page's
 * pattern (AgentDetailTabs), including its three traps: the id is not the path
 * (bui draws no underline for an empty selected key), hrefs are absolute (a
 * relative one appends inside a splat route), and Overview matches exactly
 * (its href is a prefix of every other tab's).
 *
 * The links keep the page's query string, so `?installation=` survives a tab
 * switch.
 */
export function ServerPageTabs({
  tabs,
  search,
}: {
  tabs: ServerPageTabSpec[];
  search: string;
}) {
  const basePath = useSplatBasePath();

  return (
    <Tabs>
      <TabList>
        {tabs.map(tab => (
          <Tab
            key={tab.id}
            id={tab.id}
            href={`${tab.path ? `${basePath}/${tab.path}` : basePath}${search}`}
            matchStrategy={tab.path ? 'prefix' : 'exact'}
          >
            {tab.count === undefined ? tab.title : `${tab.title} ${tab.count}`}
          </Tab>
        ))}
      </TabList>
    </Tabs>
  );
}
