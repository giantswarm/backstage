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
  RouteTabs,
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
  CustomizeWorkspacesPanel,
  EnvironmentSelect,
  useCanAddSkill,
  useCustomizeData,
  WorkflowCreateAssist,
  WorkspaceOrganizationSelect,
} from '@giantswarm/backstage-plugin-agent-platform';
import musterPlugin, {
  CONNECTOR_GROUPS,
  type ConnectorGroup,
  connectorGroupInfo,
  connectorGroupOfPath,
  CustomizeConnectorsPanel,
  CustomizeMusterProvider,
  CustomizeWorkflowsPanel,
  LEGACY_CONNECTOR_GROUP_PATHS,
  type MusterCustomizeCounts,
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
  {
    // Last: the tab the fewest people use, and least often. Offered only
    // where an installation in scope has the workspace-manager
    // (`hasWorkspaces`). Created in the workspace editor, not from here yet.
    id: 'workspaces',
    title: 'Workspaces',
    searchLabel: 'Search workspaces',
    component: 'muster',
  },
];

const DEFAULT_TAB: CustomizeTabId = 'agents';

/**
 * Whether the strip shows a tab besides the open one: Skills unless no skill
 * repository is configured, Workspaces only once an installation in scope is
 * known to have the workspace-manager, so the tab never shows where
 * workspaces are off.
 */
function isTabShown(
  id: CustomizeTabId,
  {
    hasSkillRepositories,
    hasWorkspaces,
  }: { hasSkillRepositories?: boolean; hasWorkspaces?: boolean },
): boolean {
  switch (id) {
    case 'skills':
      return hasSkillRepositories !== false;
    case 'workspaces':
      return hasWorkspaces === true;
    default:
      return true;
  }
}

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

function TabPanel({
  tab,
  search,
  connectorGroup,
}: {
  tab: CustomizeTabId;
  search: string;
  connectorGroup: ConnectorGroup;
}) {
  switch (tab) {
    case 'agents':
      return <CustomizeAgentsPanel search={search} />;
    case 'skills':
      return <CustomizeSkillsPanel search={search} />;
    case 'workspaces':
      return <CustomizeWorkspacesPanel search={search} />;
    case 'connectors':
      return (
        <CustomizeConnectorsPanel search={search} group={connectorGroup} />
      );
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
 * The Connectors tab's sub-tabs (`CONNECTOR_GROUPS`): the customer's own
 * connectors at the tab's own address, those for the platform's
 * infrastructure and the platform's internal servers each at a path under it. Routed tabs like Model hosting's
 * views, keeping the query string, so the installation scope and a search the
 * palette brought (`?q=`) survive a switch.
 */
function ConnectorGroupTabs({
  counts,
}: {
  counts: MusterCustomizeCounts['connectorGroups'];
}) {
  const customizeLink = useRouteRef(customizeRouteRef);
  const { search } = useLocation();
  return (
    <RouteTabs
      basePath={`${customizeLink?.() ?? '/customize'}/connectors`}
      search={search}
      tabs={CONNECTOR_GROUPS.map(({ id, path, title }) => ({
        id,
        path,
        title,
        count: counts?.[id],
      }))}
    />
  );
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
function CustomizeTabContent({
  tab,
  connectorGroup = 'yours',
}: {
  tab: CustomizeTab;
  /** The Connectors tab's sub-tab; the customer's own connectors by default. */
  connectorGroup?: ConnectorGroup;
}) {
  const { counts, hasSkillRepositories, hasWorkspaces } = useCustomizeData();
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
    connectors: musterCounts.connectors,
    workflows: musterCounts.workflows,
  };
  const groupTitle =
    tab.id === 'connectors' && connectorGroup !== 'yours'
      ? connectorGroupInfo(connectorGroup).title
      : undefined;
  const tabs = CUSTOMIZE_TABS.filter(
    candidate =>
      candidate.id === tab.id ||
      isTabShown(candidate.id, { hasSkillRepositories, hasWorkspaces }),
  ).map(({ id, title }) => ({ id, path: id, title, count: tabCounts[id] }));

  return (
    <ShellPage
      title="Customize"
      // Each tab names itself, as the section's pages do: "Agents · Customize
      // · Agent Platform". Without it every tab carried the bare "Customize"
      // (live round 2, R5).
      documentTitle={
        groupTitle
          ? [groupTitle, tab.title, 'Customize']
          : [tab.title, 'Customize']
      }
      description="Manage the agents, skills, workspaces, connectors and models behind your sessions."
      actions={
        tab.id === 'workspaces' ? (
          <Flex gap="3" align="end" style={{ flexWrap: 'wrap' }}>
            <WorkspaceOrganizationSelect />
            <EnvironmentSelect component={tab.component} />
          </Flex>
        ) : (
          <EnvironmentSelect component={tab.component} />
        )
      }
      tabs={tabs}
    >
      <Flex direction="column" gap="5">
        {tab.id === 'connectors' && (
          <ConnectorGroupTabs counts={musterCounts.connectorGroups} />
        )}
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
        <TabPanel
          tab={tab.id}
          search={search}
          connectorGroup={connectorGroup}
        />
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

/** Opens a Connectors sub-tab at its own address, keeping the query string. */
function ConnectorsTabRedirect({ group }: { group: ConnectorGroup }) {
  const { search } = useLocation();
  const customizeLink = useRouteRef(customizeRouteRef);
  const { path } = connectorGroupInfo(group);
  return (
    <Navigate
      to={{
        pathname: `${customizeLink?.() ?? '/customize'}/connectors${
          path ? `/${path}` : ''
        }`,
        search,
      }}
      replace
    />
  );
}

/**
 * The Connectors sub-tab a path below the tab names: none for the tab's own
 * address, one segment for the others. Anything else (a deeper path, an
 * unknown segment) is undefined. A connector's own page lives under the Agent
 * Platform, so no connector's name is ever a path here.
 */
function connectorGroupOfSegments(
  segments: string[],
): ConnectorGroup | undefined {
  if (segments.length === 0) {
    return 'yours';
  }
  return segments.length === 1 && segments[0] !== ''
    ? connectorGroupOfPath(segments[0])
    : undefined;
}

function CustomizeTabPage() {
  const splat = useParams()['*'] ?? '';
  const [tabId, ...rest] = splat.split('/');
  const { search } = useLocation();
  const { hasSkillRepositories } = useCustomizeData();
  const tab = CUSTOMIZE_TABS.find(candidate => candidate.id === tabId);
  // Skills without a repository lands on the first tab. Workspaces always
  // render at their address: whether an installation has the
  // workspace-manager settles only as the probes answer, and the panel says
  // so where none has.
  if (!tab || (tab.id === 'skills' && hasSkillRepositories === false)) {
    return <DefaultTabRedirect />;
  }
  let connectorGroup: ConnectorGroup | undefined;
  if (tab.id === 'connectors') {
    // A trailing slash names the same sub-tab, at its own address, so the
    // strip can tell which is open; a retired sub-tab path (`families`)
    // names the sub-tab it became; any other path lands on the default.
    const trimmed = rest[rest.length - 1] === '' ? rest.slice(0, -1) : rest;
    const retired =
      trimmed.length === 1 &&
      Object.hasOwn(LEGACY_CONNECTOR_GROUP_PATHS, trimmed[0])
        ? LEGACY_CONNECTOR_GROUP_PATHS[trimmed[0]]
        : undefined;
    if (retired) {
      return <ConnectorsTabRedirect group={retired} />;
    }
    connectorGroup = connectorGroupOfSegments(trimmed);
    if (!connectorGroup || trimmed.length !== rest.length) {
      return <ConnectorsTabRedirect group={connectorGroup ?? 'yours'} />;
    }
  }
  // Keyed by tab, so the search starts over on each tab — and by the
  // address's `q`, so a link that brings a search (the palette's "+N more")
  // reseeds it even when it lands on the tab already open. Typing never
  // writes `q` back, so a keystroke does not remount anything.
  const query = new URLSearchParams(search).get('q') ?? '';
  // Not keyed by the sub-tab: a search carries over to the next one.
  return (
    <CustomizeTabContent
      key={`${tab.id}?${query}`}
      tab={tab}
      connectorGroup={connectorGroup}
    />
  );
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
 * is outside the screen's providers: it mounts only the agent-platform data
 * it reads (`CustomizeModelPage`), not the skill catalogue or muster, whose
 * errors panel would otherwise sit above it. Both share one query client, so
 * the list's reads are cache hits on the page. Rendered without the app's
 * page layout, so it mounts the header-actions slot its pages render.
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
