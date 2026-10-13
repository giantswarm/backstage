import { useState } from 'react';
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useParams,
} from 'react-router-dom';
import {
  RouteRef,
  SubRouteRef,
  useRouteRef,
} from '@backstage/frontend-plugin-api';
import type { PlatformComponent } from '@giantswarm/backstage-plugin-gs';
import { ButtonLink, Flex, SearchField } from '@backstage/ui';
import AddIcon from '@material-ui/icons/Add';
import {
  PageHeaderActionsProvider,
  ShellDocumentTitle,
  ShellPage,
  usePhoneLayout,
} from '@giantswarm/backstage-plugin-ui-react';
import {
  agentPlatformPlugin,
  CustomizeAgentsPanel,
  CustomizeDataProvider,
  CustomizeModelPage,
  CustomizeModelsPanel,
  CustomizeSkillsPanel,
  EnvironmentSelect,
  useCanAddSkill,
  useCustomizeData,
  WorkflowCreateAssist,
} from '@giantswarm/backstage-plugin-agent-platform';
import musterPlugin, {
  CustomizeConnectorsPanel,
  CustomizeMusterProvider,
  CustomizeWorkflowsPanel,
  useMusterCustomizeCounts,
} from '@giantswarm/backstage-plugin-muster';
import { customizeRouteRef } from '../routes';
import type { CustomizeTabId } from '../customizeTabIds';

type CustomizeTab = {
  id: CustomizeTabId;
  title: string;
  searchLabel: string;
  /** The component whose installations the Environment control describes. */
  component?: PlatformComponent;
  create?: {
    label: string;
    routeRef: RouteRef<undefined> | SubRouteRef<undefined>;
  };
};

/** The tabs of `/customize/:tab`, in strip order. */
export const CUSTOMIZE_TABS: CustomizeTab[] = [
  {
    id: 'agents',
    title: 'Agents',
    searchLabel: 'Search agents',
    component: 'kagent',
    create: {
      label: 'New agent',
      routeRef: agentPlatformPlugin.routes.newAgent,
    },
  },
  {
    id: 'skills',
    title: 'Skills',
    searchLabel: 'Search skills',
    // Offered only where a github.com repository can take the pull request
    // (`useCanAddSkill`).
    create: {
      label: 'Add skill',
      routeRef: agentPlatformPlugin.routes.newSkill,
    },
  },
  {
    id: 'connectors',
    title: 'Connectors',
    searchLabel: 'Search connectors and tools',
    component: 'muster',
    create: {
      label: 'Add connector',
      routeRef: musterPlugin.routes.newMcpServer,
    },
  },
  {
    id: 'models',
    title: 'Models',
    searchLabel: 'Search models',
    component: 'kagent',
    create: {
      label: 'Connect a model',
      routeRef: agentPlatformPlugin.routes.newModel,
    },
  },
  {
    id: 'workflows',
    title: 'Workflows',
    searchLabel: 'Search workflows',
    component: 'muster',
  },
];

const DEFAULT_TAB: CustomizeTabId = 'agents';

function CreateAction({
  create,
  fullWidth,
}: {
  create: NonNullable<CustomizeTab['create']>;
  fullWidth: boolean;
}) {
  const link = useRouteRef(create.routeRef);
  if (!link) {
    return null;
  }
  return (
    <ButtonLink
      href={link()}
      variant="primary"
      iconStart={<AddIcon />}
      style={fullWidth ? { width: '100%' } : undefined}
    >
      {create.label}
    </ButtonLink>
  );
}

function TabPanel({ tab, search }: { tab: CustomizeTabId; search: string }) {
  switch (tab) {
    case 'agents':
      return <CustomizeAgentsPanel search={search} />;
    case 'skills':
      return <CustomizeSkillsPanel search={search} />;
    case 'connectors':
      return <CustomizeConnectorsPanel search={search} />;
    case 'models':
      return <CustomizeModelsPanel search={search} />;
    default:
      // Workflows are read-only here (D11): the way to a new one is the
      // workflow agent's hand-off, which agent-platform draws.
      return (
        <CustomizeWorkflowsPanel
          search={search}
          createAssist={renderWorkflowCreateAssist}
        />
      );
  }
}

function renderWorkflowCreateAssist(installation: string) {
  return <WorkflowCreateAssist installation={installation} />;
}

/**
 * One tab: its search and action, and its panel. Global-only (D4): no
 * organization filter; the Environment select shows only with more than one.
 *
 * The search is always there (T49): these five tabs are the catalog's front
 * door, and the PO missed the field over a short list. The `SEARCH_MIN` gate
 * stays on the secondary and embedded lists. Each panel draws its own filters
 * under the search, from its own data, and only those that would change the
 * list.
 */
function CustomizeTabContent({ tab }: { tab: CustomizeTab }) {
  const { counts, hasSkillRepositories } = useCustomizeData();
  const canAddSkill = useCanAddSkill();
  const create = tab.id === 'skills' && !canAddSkill ? undefined : tab.create;
  const musterCounts = useMusterCustomizeCounts();
  const location = useLocation();
  const isPhone = usePhoneLayout();
  // Seeded once from `?q=`, so a link (the command palette's "+N more") can
  // open the tab already searched. Not written back.
  const [search, setSearch] = useState(
    () => new URLSearchParams(location.search).get('q') ?? '',
  );

  const tabCounts: Partial<Record<CustomizeTabId, number>> = {
    ...counts,
    ...musterCounts,
  };
  const tabs = CUSTOMIZE_TABS.filter(
    candidate => candidate.id !== 'skills' || hasSkillRepositories !== false,
  ).map(({ id, title }) => ({ id, path: id, title, count: tabCounts[id] }));

  return (
    <ShellPage
      title="Customize"
      // Each tab names itself, as the section's pages do: "Agents · Customize
      // · Agent Platform". Without it every tab carried the bare "Customize"
      // (live round 2, R5).
      documentTitle={[tab.title, 'Customize']}
      description="Manage the agents, skills, connectors and models behind your sessions."
      actions={<EnvironmentSelect component={tab.component} />}
      tabs={tabs}
    >
      <Flex direction="column" gap="5">
        <Flex
          align="center"
          justify="between"
          gap="4"
          style={{ flexWrap: 'wrap' }}
        >
          {/* The search's 360px is wider than a phone's 343px content, so
              there the create action always wrapped under it, left-aligned
              (T22 P1). On a phone both take the full width, one per line. */}
          <div
            style={{
              flex: isPhone ? '1 1 100%' : '0 1 360px',
              minWidth: 0,
            }}
          >
            <SearchField
              aria-label={tab.searchLabel}
              placeholder={tab.searchLabel}
              value={search}
              onChange={setSearch}
            />
          </div>
          {create && <CreateAction create={create} fullWidth={isPhone} />}
        </Flex>
        <TabPanel tab={tab.id} search={search} />
      </Flex>
    </ShellPage>
  );
}

/** Opens the first tab, keeping the query string (the installation scope). */
function DefaultTabRedirect() {
  const { search } = useLocation();
  const customizeLink = useRouteRef(customizeRouteRef);
  return (
    <Navigate
      to={{
        pathname: `${customizeLink?.() ?? '/customize'}/${DEFAULT_TAB}`,
        search,
      }}
      replace
    />
  );
}

function CustomizeTabPage() {
  const tabId = (useParams()['*'] ?? '').split('/')[0];
  const { search } = useLocation();
  const { hasSkillRepositories } = useCustomizeData();
  const tab = CUSTOMIZE_TABS.find(candidate => candidate.id === tabId);
  if (!tab || (tab.id === 'skills' && hasSkillRepositories === false)) {
    return <DefaultTabRedirect />;
  }
  // Keyed by tab, so the search starts over on each tab — and by the
  // address's `q`, so a link that brings a search (the palette's "+N more")
  // reseeds it even when it lands on the tab already open. Typing never
  // writes `q` back, so a keystroke does not remount anything.
  const query = new URLSearchParams(search).get('q') ?? '';
  return <CustomizeTabContent key={`${tab.id}?${query}`} tab={tab} />;
}

/** The Customize screen itself: its tabs, over the data they share. */
function CustomizeScreen() {
  return (
    <CustomizeMusterProvider>
      <CustomizeDataProvider>
        <Routes>
          <Route index element={<DefaultTabRedirect />} />
          <Route path="*" element={<CustomizeTabPage />} />
        </Routes>
      </CustomizeDataProvider>
    </CustomizeMusterProvider>
  );
}

/**
 * The shell's Customize page: a tab per area at `/customize/:tab`, with
 * `/customize` opening the first, and one model's page beside the Models tab
 * (`/customize/models/<installation>/<namespace>/<name>`). The model's page
 * sits outside the screen's providers, which read every agent, the skill
 * catalogue and muster for the tabs; it mounts only what it reads. Rendered
 * without the app's page layout, so it mounts the header-actions slot its
 * pages render.
 */
export function CustomizePage() {
  return (
    <PageHeaderActionsProvider>
      {/* Until a tab's page names itself. */}
      <ShellDocumentTitle title="Customize" />
      <Routes>
        <Route
          path="models/:installation/:namespace/:name"
          element={<CustomizeModelPage />}
        />
        <Route path="*" element={<CustomizeScreen />} />
      </Routes>
    </PageHeaderActionsProvider>
  );
}
