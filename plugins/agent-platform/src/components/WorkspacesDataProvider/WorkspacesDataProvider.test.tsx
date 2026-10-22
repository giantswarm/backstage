import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MusterUnauthorizedError } from '@giantswarm/backstage-plugin-muster';
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
/**
 * The person's Organizations the manager names, per installation; `undefined`
 * for a manager older than 0.8.0, which names none.
 */
let mockMemberOf: Record<string, string[]> | undefined;
/** The installations the inventory knows to run muster, and whether it still probes. */
let mockMusterInstallations: string[];
let mockProbing: boolean;
/** The installations whose muster does not answer. */
let mockUnreachable: string[];
/** The installations whose muster has no per-user sign-in in this portal. */
let mockSharedIdentity: string[];
/** The installations where the person has not signed in to the workspace-manager. */
let mockNotSignedIn: string[];

const mockMusterApi = {
  listInstallations: jest.fn(async () => ({
    installations: mockMusterInstallations.map(name => ({
      name,
      requiresAuth: !mockSharedIdentity.includes(name),
    })),
  })),
  listServers: jest.fn(async (installation: string) => {
    if (mockUnreachable.includes(installation)) {
      throw new Error('muster: 503 Service Unavailable');
    }
    return {
      mcpServers: mockWithManager.includes(installation)
        ? [{ name: 'workspace-manager' }]
        : [{ name: 'kubernetes' }],
    };
  }),
  callTool: jest.fn(
    async (tool: string, _args: unknown, installation: string) => {
      if (tool !== 'x_workspace-manager_list_workspaces') {
        throw new Error(`unexpected ${tool}`);
      }
      if (mockNotSignedIn.includes(installation)) {
        // muster-backend's 401, as the muster client reads it: the reason
        // says what is wanted, whatever the wording.
        throw new MusterUnauthorizedError(
          'workspace-manager needs your sign-in.',
          'server_sign_in_required',
          'workspace-manager',
          installation,
        );
      }
      return {
        workspaces: mockWorkspaces[installation] ?? [],
        ...(mockMemberOf
          ? { organizations: mockMemberOf[installation] ?? [] }
          : {}),
      };
    },
  ),
};

jest.mock('../../hooks/useMusterPluginApi', () => ({
  useMusterPluginApi: () => mockMusterApi,
}));
jest.mock('../WorkspaceManagerSignIn', () => ({
  WorkspaceManagerSignIn: (props: { installation: string }) => (
    <p>{`sign in on ${props.installation}`}</p>
  ),
}));
jest.mock('@giantswarm/backstage-plugin-gs', () => ({
  useInstallationInventory: () => ({
    installationsWith: () => mockMusterInstallations,
    isLoading: false,
    isProbing: mockProbing,
  }),
  useInstallationScope: () => ({ scope: 'all' }),
  applyInstallationScope: (installations: string[]) => installations,
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
    mockMemberOf = { gazelle: ['alpha', 'beta'] };
    mockMusterInstallations = ['gazelle'];
    mockProbing = false;
    mockUnreachable = [];
    mockSharedIdentity = [];
    mockNotSignedIn = [];
    jest.clearAllMocks();
  });

  // giantswarm/backstage#3236 review: the sign-in follows the 401's reason,
  // not the wording of its message.
  it('offers the workspace-manager sign-in where the read asks for it, not the refusal', async () => {
    mockNotSignedIn = ['gazelle'];
    await renderWorkspaces();

    expect(await screen.findByText('sign in on gazelle')).toBeInTheDocument();
    expect(screen.queryByText('Your workspaces could not be read')).toBeNull();
  });

  it('is not available where no installation in scope has the workspace-manager', async () => {
    mockWithManager = [];
    await renderWorkspaces();

    expect(await screen.findByText('available: false')).toBeInTheDocument();
    expect(mockMusterApi.callTool).not.toHaveBeenCalled();
  });

  it('is not available, and says why, where muster has no per-user sign-in', async () => {
    mockSharedIdentity = ['gazelle'];
    await renderWorkspaces();

    expect(await screen.findByText('available: false')).toBeInTheDocument();
    expect(
      screen.getByText('Workspaces cannot be used on gazelle from this portal'),
    ).toBeInTheDocument();
    expect(mockMusterApi.callTool).not.toHaveBeenCalled();
  });

  it('is not known yet while the inventory still probes for muster', async () => {
    mockMusterInstallations = [];
    mockProbing = true;
    await renderWorkspaces();

    expect(await screen.findByText('available: undefined')).toBeInTheDocument();
  });

  it('is not known, and says why, where no muster answered', async () => {
    mockUnreachable = ['gazelle'];
    await renderWorkspaces();

    expect(
      await screen.findByText('Your workspaces could not be read'),
    ).toBeInTheDocument();
    expect(screen.getByText('available: undefined')).toBeInTheDocument();
    expect(screen.queryByText('Workspaces are not available here')).toBeNull();
  });

  it('offers no Organization scope to a person in one Organization', async () => {
    mockWorkspaces = { gazelle: [workspace('docs', 'alpha')] };
    mockMemberOf = { gazelle: ['alpha'] };
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

  it('offers an Organization without a workspace yet where the manager names the person a member, in one call', async () => {
    mockWorkspaces = { gazelle: [workspace('docs', 'alpha')] };
    mockMemberOf = { gazelle: ['alpha', 'gamma'] };
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
    expect(mockMusterApi.callTool).toHaveBeenCalledTimes(1);
  });

  it('offers the workspaces’ own Organizations from a manager that names none', async () => {
    mockMemberOf = undefined;
    await renderWorkspaces();

    await waitFor(() => expect(shownNames()).toEqual(['docs']));
    await userEvent.click(screen.getByRole('button', { name: /Organization/ }));
    const options = (await screen.findAllByRole('option')).map(
      option => option.textContent,
    );
    expect(options).toEqual(['alpha', 'beta']);
  });
});
