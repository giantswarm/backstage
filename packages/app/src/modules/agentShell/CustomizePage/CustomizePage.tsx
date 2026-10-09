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
  ALL_ORGANIZATIONS,
  CustomizeAgentsPanel,
  CustomizeDataProvider,
  CustomizeModelsPanel,
  CustomizeSkillsPanel,
  EnvironmentSelect,
  OrganizationSelect,
  useCustomizeData,
} from '@giantswarm/backstage-plugin-agent-platform';
import musterPlugin, {
  CustomizeConnectorsPanel,
  CustomizeMusterProvider,
  CustomizeWorkflowsPanel,
  useMusterCustomizeCounts,
} from '@giantswarm/backstage-plugin-muster';
import { customizeRouteRef } from '../routes';

type CustomizeTabId =
  'agents' | 'skills' | 'connectors' | 'models' | 'workflows';

type CustomizeTab = {
  id: CustomizeTabId;
  title: string;
  searchLabel: string;
  /** The component whose installations the Environment control describes. */
  component?: PlatformComponent;
  /** Whether the tab can be narrowed to one organization (namespace). */
  byOrganization?: boolean;
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
    byOrganization: true,
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
    byOrganization: true,
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

function TabPanel({
  tab,
  search,
  organization,
}: {
  tab: CustomizeTabId;
  search: string;
  organization: string;
}) {
  switch (tab) {
    case 'agents':
      return (
        <CustomizeAgentsPanel search={search} organization={organization} />
      );
    case 'skills':
      return <CustomizeSkillsPanel search={search} />;
    case 'connectors':
      return <CustomizeConnectorsPanel search={search} />;
    case 'models':
      return (
        <CustomizeModelsPanel search={search} organization={organization} />
      );
    default:
      return <CustomizeWorkflowsPanel search={search} />;
  }
}

/** One tab: its filters, search and action, and its panel. */
function CustomizeTabContent({ tab }: { tab: CustomizeTab }) {
  const {
    counts,
    hasSkillRepositories,
    agentOrganizations,
    modelOrganizations,
  } = useCustomizeData();
  const musterCounts = useMusterCustomizeCounts();
  const [search, setSearch] = useState('');
  const [organization, setOrganization] = useState(ALL_ORGANIZATIONS);

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
      actions={
        <Flex align="end" gap="3" style={{ flexWrap: 'wrap' }}>
          {tab.byOrganization && (
            <OrganizationSelect
              organizations={
                tab.id === 'models' ? modelOrganizations : agentOrganizations
              }
              value={organization}
              onChange={setOrganization}
            />
          )}
          <EnvironmentSelect component={tab.component} />
        </Flex>
      }
      tabs={tabs}
    >
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
        <TabPanel tab={tab.id} search={search} organization={organization} />
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
  // Keyed by tab, so the search and the organization start over on each tab.
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
