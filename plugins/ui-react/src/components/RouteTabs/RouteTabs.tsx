import { Tab, TabList, Tabs } from '@backstage/ui';
import { useSplatBasePath } from '../../hooks/useSplatBasePath';

export interface RouteTabSpec {
  id: string;
  /** The tab's path segment below the page; empty for the page's index. */
  path: string;
  title: string;
  /** Shown after the title, as `Tools (10)`; absent is not zero. */
  count?: number;
}

export interface RouteTabsProps {
  tabs: RouteTabSpec[];
  /** The query string every tab link keeps, e.g. `?installation=gazelle`. */
  search?: string;
}

/**
 * A page's tab strip whose tabs are routes: navigation links whose active state
 * follows the URL, the content drawn by the page's own `<Routes>`. Mounted
 * inside the page's splat route (`<Route path=":name/*">`), so the links are
 * built from its base path.
 *
 * Three traps it handles: the id is not the path (bui draws no underline for an
 * empty selected key), hrefs are absolute (a relative one appends inside a splat
 * route), and the index matches exactly (its href is a prefix of every other
 * tab's).
 */
export function RouteTabs({ tabs, search = '' }: RouteTabsProps) {
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
            {tab.count === undefined
              ? tab.title
              : `${tab.title} (${tab.count})`}
          </Tab>
        ))}
      </TabList>
    </Tabs>
  );
}
