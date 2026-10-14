import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Workspace } from '../../lib/workspaceManager';
import { CustomizeWorkspacesPanel } from '../CustomizeWorkspacesPanel';
import { WorkspaceOrganizationSelect } from '../WorkspaceOrganizationSelect';
import {
  useWorkspacesData,
  WorkspacesDataProvider,
} from './WorkspacesDataProvider';

function workspace(name: string, organization: string): Workspace {
  return {
    name,
    organization,
    sources: [
      { provider: 'github', owner: 'example-org', repositories: [name] },
    ],
    sync: { schedule: 'nightly' },
    resourceVersion: '1',
    createdAt: '2026-10-01T00:00:00Z',
    lastSync: { time: '2026-10-14T03:00:00Z', result: 'Succeeded' },
    repositories: 1,
    sessions: 0,
  };
}

/** What the person's workspace-manager answers, per installation. */
let mockWorkspaces: Record<string, Workspace[]>;
/** The installations whose muster lists the workspace-manager. */
let mockWithManager: string[];
/** The Organization resources the person reads. */
let mockOrganizations: { cluster: string; name: string }[];
/** Organizations whose manager refuses the person as not a member. */
let mockNotMember: string[];

const mockMusterApi = {
  listServers: jest.fn(async (installation: string) => ({
    mcpServers: mockWithManager.includes(installation)
      ? [{ name: 'workspace-manager' }]
      : [{ name: 'kubernetes' }],
  })),
  callTool: jest.fn(
    async (
      tool: string,
      args: { organization?: string },
      installation: string,
    ) => {
      if (tool !== 'x_workspace-manager_list_workspaces') {
        throw new Error(`unexpected ${tool}`);
      }
      if (args.organization && mockNotMember.includes(args.organization)) {
        throw new Error(
          `list workspaces: permission denied: forbidden: dev@example.io is not a member of Organization "${args.organization}"`,
        );
      }
      const all = mockWorkspaces[installation] ?? [];
      return {
        workspaces: args.organization
          ? all.filter(w => w.organization === args.organization)
          : all,
      };
    },
  ),
};

jest.mock('../../hooks/useMusterPluginApi', () => ({
  useMusterPluginApi: () => mockMusterApi,
}));
jest.mock('@giantswarm/backstage-plugin-gs', () => ({
  useInstallationInventory: () => ({
    installationsWith: () => ['gazelle'],
    isLoading: false,
  }),
  useInstallationScope: () => ({ scope: 'all' }),
  applyInstallationScope: (installations: string[]) => installations,
}));
jest.mock('@giantswarm/backstage-plugin-kubernetes-react', () => ({
  Organization: class {},
  useResources: (installations: string[]) => ({
    resources: mockOrganizations
      .filter(o => installations.includes(o.cluster))
      .map(o => ({ cluster: o.cluster, getName: () => o.name })),
  }),
}));

function Availability() {
  const { isAvailable } = useWorkspacesData();
  return <p>{`available: ${String(isAvailable)}`}</p>;
}

function renderWorkspaces() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderInTestApp(
    <QueryClientProvider client={queryClient}>
      <WorkspacesDataProvider>
        <Availability />
        <WorkspaceOrganizationSelect />
        <CustomizeWorkspacesPanel search="" />
      </WorkspacesDataProvider>
    </QueryClientProvider>,
  );
}

const shownNames = () =>
  screen
    .getAllByRole('rowheader')
    .map(cell => within(cell).getAllByText(/./)[0].textContent);

describe('WorkspacesDataProvider', () => {
  beforeEach(() => {
    mockWithManager = ['gazelle'];
    mockWorkspaces = {
      gazelle: [workspace('docs', 'alpha'), workspace('mcp', 'beta')],
    };
    mockOrganizations = [];
    mockNotMember = [];
    jest.clearAllMocks();
  });

  it('is not available where no installation in scope has the workspace-manager', async () => {
    mockWithManager = [];
    await renderWorkspaces();

    expect(await screen.findByText('available: false')).toBeInTheDocument();
    expect(mockMusterApi.callTool).not.toHaveBeenCalled();
  });

  it('offers no Organization scope to a person in one Organization', async () => {
    mockWorkspaces = { gazelle: [workspace('docs', 'alpha')] };
    await renderWorkspaces();

    await waitFor(() => expect(shownNames()).toEqual(['docs']));
    expect(screen.getByText('available: true')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Organization/ })).toBeNull();
  });

  it('switches the table to the Organization picked, for a person in two', async () => {
    await renderWorkspaces();

    await waitFor(() => expect(shownNames()).toEqual(['docs']));
    await userEvent.click(screen.getByRole('button', { name: /Organization/ }));
    await userEvent.click(await screen.findByRole('option', { name: 'beta' }));

    await waitFor(() => expect(shownNames()).toEqual(['mcp']));
  });

  it('offers an Organization without a workspace yet only where the manager takes the person as a member', async () => {
    mockWorkspaces = { gazelle: [workspace('docs', 'alpha')] };
    mockOrganizations = [
      { cluster: 'gazelle', name: 'alpha' },
      { cluster: 'gazelle', name: 'gamma' },
      { cluster: 'gazelle', name: 'outside' },
    ];
    mockNotMember = ['outside'];
    await renderWorkspaces();

    await waitFor(() => expect(shownNames()).toEqual(['docs']));
    await userEvent.click(screen.getByRole('button', { name: /Organization/ }));
    const options = (await screen.findAllByRole('option')).map(
      option => option.textContent,
    );
    expect(options).toEqual(['alpha', 'gamma']);

    await userEvent.click(screen.getByRole('option', { name: 'gamma' }));
    expect(
      await screen.findByText('No workspaces in gamma yet'),
    ).toBeInTheDocument();
  });
});
