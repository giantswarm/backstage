import { useState } from 'react';
import { Helmet } from 'react-helmet';
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useParams,
} from 'react-router-dom';
import {
  configApiRef,
  RouteRef,
  SubRouteRef,
  useApi,
  useRouteRef,
} from '@backstage/frontend-plugin-api';
import type { PlatformComponent } from '@giantswarm/backstage-plugin-gs';
import { ButtonLink, Flex, SearchField } from '@backstage/ui';
import AddIcon from '@material-ui/icons/Add';
import {
  PageHeaderActionsProvider,
  ShellPage,
} from '@giantswarm/backstage-plugin-ui-react';
import {
  agentPlatformPlugin,
  CustomizeAgentsPanel,
  CustomizeDataProvider,
  CustomizeModelsPanel,
  CustomizeSkillsPanel,
  EnvironmentSelect,
  useCustomizeData,
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
  { id: 'skills', title: 'Skills', searchLabel: 'Search skills' },
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
      label: 'Add model',
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
}: {
  create: NonNullable<CustomizeTab['create']>;
}) {
  const link = useRouteRef(create.routeRef);
  if (!link) {
    return null;
  }
  return (
    <ButtonLink href={link()} variant="primary" iconStart={<AddIcon />}>
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
      return <CustomizeWorkflowsPanel search={search} />;
  }
}

/**
 * One tab: its search and action, and its panel. Global-only (D4): no
 * organization filter; the Environment select shows only with more than one.
 */
function CustomizeTabContent({ tab }: { tab: CustomizeTab }) {
  const { counts, hasSkillRepositories } = useCustomizeData();
  const musterCounts = useMusterCustomizeCounts();
  const [search, setSearch] = useState('');

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
      description="The agents, skills, connectors and models behind your sessions."
      actions={<EnvironmentSelect component={tab.component} />}
      tabs={tabs}
    >
      {/* Each tab names itself, as the section's tabs do ("Sessions · Agent
          Platform"): "Agents · Customize | <app>", under the page's template.
          Without it every tab carried the bare "Customize" (live round 2, R5). */}
      <Helmet title={`${tab.title} · Customize`} />
      <Flex direction="column" gap="5">
        <Flex
          align="center"
          justify="between"
          gap="4"
          style={{ flexWrap: 'wrap' }}
        >
          <div style={{ flex: '0 1 360px', minWidth: 0 }}>
            <SearchField
              aria-label={tab.searchLabel}
              placeholder={tab.searchLabel}
              value={search}
              onChange={setSearch}
            />
          </div>
          {tab.create && <CreateAction create={tab.create} />}
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
  const { hasSkillRepositories } = useCustomizeData();
  const tab = CUSTOMIZE_TABS.find(candidate => candidate.id === tabId);
  if (!tab || (tab.id === 'skills' && hasSkillRepositories === false)) {
    return <DefaultTabRedirect />;
  }
  // Keyed by tab, so the search starts over on each tab.
  return <CustomizeTabContent key={tab.id} tab={tab} />;
}

/**
 * The shell's Customize screen: a tab per area at `/customize/:tab`, with
 * `/customize` opening the first. Rendered without the app's page layout, so
 * it mounts the header-actions slot its pages render.
 */
export function CustomizePage() {
  const appTitle =
    useApi(configApiRef).getOptionalString('app.title') ?? 'Backstage';
  return (
    <PageHeaderActionsProvider>
      <Helmet title="Customize" titleTemplate={`%s | ${appTitle}`} />
      <CustomizeMusterProvider>
        <CustomizeDataProvider>
          <Routes>
            <Route index element={<DefaultTabRedirect />} />
            <Route path="*" element={<CustomizeTabPage />} />
          </Routes>
        </CustomizeDataProvider>
      </CustomizeMusterProvider>
    </PageHeaderActionsProvider>
  );
}
