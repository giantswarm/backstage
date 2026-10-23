import { useState, type ReactElement } from 'react';
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
  type RouteTabCount,
  RouteTabs,
  ShellDocumentTitle,
  ShellPage,
  usePhoneLayout,
} from '@giantswarm/backstage-plugin-ui-react';
import {
  agentPlatformPlugin,
  CustomizeAgentsPanel,
  CustomizeDataProvider,
  CustomizeModelsPanel,
  CustomizeSkillsPanel,
  CustomizeToolchainsPanel,
  CustomizeWorkspacesIntro,
  CustomizeWorkspacesPanel,
  CreateWorkspaceButton,
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
    // (`hasWorkspaces`). Its create action is `CreateWorkspaceButton`, which
    // carries the tab's Organization and installation to the editor.
    id: 'workspaces',
    title: 'Workspaces',
    searchLabel: 'Search workspaces',
    component: 'muster',
  },
  {
    // Offered only where an installation in scope has the toolchain-manager
    // (`hasToolchains`).
    id: 'toolchains',
    title: 'Toolchains',
    searchLabel: 'Search toolchains',
    component: 'muster',
    create: {
      label: 'New toolchain',
      routeRef: agentPlatformPlugin.routes.newToolchain,
    },
  },
];

const DEFAULT_TAB: CustomizeTabId = 'agents';

const CONNECTORS_TAB = CUSTOMIZE_TABS.find(tab => tab.id === 'connectors')!;

/**
 * Whether the strip shows a tab besides the open one: Skills unless no skill
 * repository is configured, Workspaces and Toolchains only once an
 * installation in scope is known to have the workspace-manager or the
 * toolchain-manager, so the tab never shows where they are off.
 */
function isTabShown(
  id: CustomizeTabId,
  {
    hasSkillRepositories,
    hasWorkspaces,
    hasToolchains,
  }: {
    hasSkillRepositories?: boolean;
    hasWorkspaces?: boolean;
    hasToolchains?: boolean;
  },
): boolean {
  switch (id) {
    case 'skills':
      return hasSkillRepositories !== false;
    case 'workspaces':
      return hasWorkspaces === true;
    case 'toolchains':
      return hasToolchains === true;
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
    case 'toolchains':
      return <CustomizeToolchainsPanel search={search} />;
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
 * This page's own path, through the route ref it is mounted at, so links
 * follow the app's mount and any base path. It always resolves on this page;
 * rendered anywhere else, it fails loudly rather than link to a guess.
 */
function useCustomizePath(): string {
  const customizeLink = useRouteRef(customizeRouteRef);
  if (!customizeLink) {
    throw new Error('The Customize page is not mounted at customizeRouteRef');
  }
  return customizeLink();
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
  const customize = useCustomizePath();
  const { search } = useLocation();
  return (
    <RouteTabs
      basePath={`${customize}/connectors`}
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
  const { counts, hasSkillRepositories, hasWorkspaces, hasToolchains } =
    useCustomizeData();
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

  const tabCounts: Partial<Record<CustomizeTabId, RouteTabCount>> = {
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
      isTabShown(candidate.id, {
        hasSkillRepositories,
        hasWorkspaces,
        hasToolchains,
      }),
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
        {tab.id === 'workspaces' && <CustomizeWorkspacesIntro />}
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
          {tab.id === 'workspaces' ? (
            <CreateWorkspaceButton fullWidth={isPhone} />
          ) : (
            create && <CreateAction create={create} fullWidth={isPhone} />
          )}
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
  const customize = useCustomizePath();
  return (
    <Navigate
      to={{
        pathname: `${customize}/${DEFAULT_TAB}`,
        search,
      }}
      replace
    />
  );
}

/** Opens a Connectors sub-tab at its own address, keeping the query string. */
function ConnectorsTabRedirect({ group }: { group: ConnectorGroup }) {
  const { search } = useLocation();
  const customize = useCustomizePath();
  const { path } = connectorGroupInfo(group);
  return (
    <Navigate
      to={{
        pathname: `${customize}/connectors${path ? `/${path}` : ''}`,
        search,
      }}
      replace
    />
  );
}

/**
 * An address no route below claims, sent to its nearest valid parent: the
 * tab it starts with, else the first tab.
 */
function NearestTabRedirect() {
  const { search } = useLocation();
  const customize = useCustomizePath();
  const [tabId] = (useParams()['*'] ?? '').split('/');
  const tab = CUSTOMIZE_TABS.find(candidate => candidate.id === tabId);
  return (
    <Navigate
      to={{ pathname: `${customize}/${tab?.id ?? DEFAULT_TAB}`, search }}
      replace
    />
  );
}

function CustomizeTabPage({
  tab,
  connectorGroup,
}: {
  tab: CustomizeTab;
  connectorGroup?: ConnectorGroup;
}) {
  const { pathname, search } = useLocation();
  const { hasSkillRepositories } = useCustomizeData();
  // A trailing slash names the same tab, at its own address, so the strips
  // can tell which tab and sub-tab are open.
  if (pathname.length > 1 && pathname.endsWith('/')) {
    return (
      <Navigate
        to={{ pathname: pathname.replace(/\/+$/, ''), search }}
        replace
      />
    );
  }
  // Skills without a repository lands on the first tab. Workspaces always
  // render at their address: whether an installation has the
  // workspace-manager settles only as the probes answer, and the panel says
  // so where none has.
  if (tab.id === 'skills' && hasSkillRepositories === false) {
    return <DefaultTabRedirect />;
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

/**
 * The Customize screen itself, one tab of it, over the data the tabs share.
 * Every tab's address renders this same element, so switching tabs keeps
 * the providers (and their reads) mounted.
 */
function CustomizeScreen({
  tab,
  connectorGroup,
}: {
  tab: CustomizeTab;
  connectorGroup?: ConnectorGroup;
}) {
  return (
    <CustomizeMusterProvider>
      <CustomizeDataProvider>
        <CustomizeTabPage tab={tab} connectorGroup={connectorGroup} />
      </CustomizeDataProvider>
    </CustomizeMusterProvider>
  );
}

/** A plugin's tab below its list, attached to the page's `pages` input. */
export type CustomizeSubPage = {
  /** The tab's id, its path segment: `agents`, `connectors`… */
  path: string;
  /** The plugin's router for everything below the tab's list. */
  element: ReactElement;
};

/**
 * The shell's Customize page: a tab per area at `/customize/<tab>`, with
 * `/customize` opening the first, the Connectors tab's sub-tabs at
 * `/customize/connectors/<group>`, and everything deeper under a tab — a
 * resource's page, its create and edit flows — the router of the plugin that
 * attached the tab (`pages`). A static path outranks the sub-page's splat,
 * so each tab's bare path is this screen and never the plugin's router.
 *
 * The plugins' pages are outside the screen's providers: each mounts only
 * the data it reads, not the skill catalogue or muster, whose errors panel
 * would otherwise sit above it. Both share one query client, so the list's
 * reads are cache hits on the page. Rendered without the app's page layout,
 * so it mounts the header-actions slot its pages render.
 */
export function CustomizePage({ pages = [] }: { pages?: CustomizeSubPage[] }) {
  return (
    <PageHeaderActionsProvider>
      {/* Until a tab's page names itself. */}
      <ShellDocumentTitle title="Customize" />
      <Routes>
        <Route index element={<DefaultTabRedirect />} />
        {CUSTOMIZE_TABS.map(tab => (
          <Route
            key={tab.id}
            path={tab.id}
            element={<CustomizeScreen tab={tab} />}
          />
        ))}
        {CONNECTOR_GROUPS.filter(group => group.path).map(group => (
          <Route
            key={group.id}
            path={`connectors/${group.path}`}
            element={
              <CustomizeScreen tab={CONNECTORS_TAB} connectorGroup={group.id} />
            }
          />
        ))}
        {/* A retired sub-tab path (`families`) names the sub-tab it became. */}
        {Object.entries(LEGACY_CONNECTOR_GROUP_PATHS).map(([path, group]) => (
          <Route
            key={path}
            path={`connectors/${path}`}
            element={<ConnectorsTabRedirect group={group} />}
          />
        ))}
        {pages
          .filter(page =>
            CUSTOMIZE_TABS.some(candidate => candidate.id === page.path),
          )
          .map(page => (
            <Route
              key={page.path}
              path={`${page.path}/*`}
              element={page.element}
            />
          ))}
        <Route path="*" element={<NearestTabRedirect />} />
      </Routes>
    </PageHeaderActionsProvider>
  );
}
