import { ReactElement } from 'react';
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useParams,
} from 'react-router-dom';
import {
  IconElement,
  PageLayout,
  pluginHeaderActionsApiRef,
  useApi,
  useRouteRef,
} from '@backstage/frontend-plugin-api';
import { makeStyles } from '@material-ui/core';
import { rootRouteRef } from '../../routes';

const useStyles = makeStyles({
  // On a phone the header's title keeps its own row and the team and search
  // controls wrap below it, instead of squeezing the title to a letter: the
  // bui PluginHeader neither wraps nor truncates gracefully there.
  frame: {
    '@media (max-width: 600px)': {
      '& .bui-PluginHeaderToolbar': {
        flexWrap: 'wrap',
        rowGap: 'var(--bui-space-3)',
      },
      '& .bui-PluginHeaderToolbarContent': {
        flexBasis: '100%',
      },
      '& .bui-PluginHeaderToolbarControls, & .bui-PluginHeaderToolbarControls > *':
        {
          flexWrap: 'wrap',
        },
    },
  },
});

/** One of Hive's secondary tabs: the board, the knowledge reader. */
export interface HiveTab {
  path: string;
  title: string;
  element: ReactElement;
}

/**
 * `/hive/pr/:number?repo=…` (a plan link from the board's PlanPanel or an
 * old `/plans/pr/:number`) opens the review over the front page.
 */
function PullRedirect() {
  const { number = '' } = useParams();
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  params.set('pr', number);
  return <Navigate to={`..?${params.toString()}`} replace />;
}

/**
 * Hive's frame: the `PluginHeader` with the section's header actions and
 * the tab row — the front page at `/hive` first, then the secondary tabs —
 * and the routes under it. `PageBlueprint` would land a bare `/hive` on its
 * first sub-page; Hive's front page is the section's own index, so it draws
 * the frame itself through the same swappable `PageLayout` (`GSPageLayout`).
 */
export function HiveShell(props: {
  title: string;
  icon: IconElement;
  frontPage: ReactElement;
  tabs: HiveTab[];
}) {
  const { title, icon, frontPage, tabs } = props;
  const classes = useStyles();
  const headerActions = useApi(
    pluginHeaderActionsApiRef,
  ).getPluginHeaderActions('plans');
  const titleLink = useRouteRef(rootRouteRef)?.();

  return (
    <div className={classes.frame}>
      <PageLayout
        title={title}
        icon={icon}
        titleLink={titleLink}
        headerActions={headerActions}
        tabs={[
          { id: 'front-page', label: 'Front page', href: '' },
          ...tabs.map(tab => ({
            id: tab.path,
            label: tab.title,
            href: tab.path,
          })),
        ]}
      >
        <Routes>
          <Route index element={frontPage} />
          <Route path="pr/:number" element={<PullRedirect />} />
          {tabs.map(tab => (
            <Route
              key={tab.path}
              path={`${tab.path}/*`}
              element={tab.element}
            />
          ))}
        </Routes>
      </PageLayout>
    </div>
  );
}
