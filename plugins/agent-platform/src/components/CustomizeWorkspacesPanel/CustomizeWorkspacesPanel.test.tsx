import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import type { WorkspaceRow } from '../../lib/workspaceList';
import type { WorkspacesData } from '../WorkspacesDataProvider';
import { workspacesRouteRef } from '../../routes';
import { CustomizeWorkspacesPanel } from './CustomizeWorkspacesPanel';

const docs: WorkspaceRow = {
  id: 'gazelle/docs',
  installation: 'gazelle',
  name: 'docs',
  organization: 'alpha',
  sources: [
    {
      provider: 'github',
      owner: 'example-org',
      filters: { topics: { names: ['docs'] } },
    },
  ],
  sync: { schedule: 'nightly' },
  resourceVersion: '1',
  createdAt: '2026-10-01T00:00:00Z',
  lastSync: { time: '2026-10-14T03:00:00Z', result: 'Succeeded' },
  repositories: 12,
  sessions: 2,
  storedBytes: 4 * 1024 ** 3,
  volumeSize: '15Gi',
};
const infra: WorkspaceRow = {
  ...docs,
  id: 'gazelle/infra',
  name: 'infra',
  lastSync: {
    time: '2026-10-14T03:02:00Z',
    result: 'Failed',
    message: 'owner not reachable',
  },
  repositories: 0,
  sessions: 0,
  storedBytes: undefined,
  volumeSize: undefined,
};

let mockData: WorkspacesData;
const mockSync = { mutate: jest.fn(), isPending: false };
const mockRemove = {
  mutate: jest.fn(),
  reset: jest.fn(),
  isPending: false,
  error: null as Error | null,
};

jest.mock('../WorkspacesDataProvider', () => ({
  useWorkspacesData: () => mockData,
}));
jest.mock('../WorkspaceManagerSignIn', () => ({
  WorkspaceManagerSignIn: (props: {
    installation: string;
    onSignedIn: () => void;
  }) => (
    <button
      data-testid={`sign-in-${props.installation}`}
      onClick={props.onSignedIn}
    >
      signed in
    </button>
  ),
}));
jest.mock('../../hooks/useWorkspaceActions', () => ({
  useWorkspaceActions: () => ({ sync: mockSync, remove: mockRemove }),
  useWorkspaceDetail: (_installation: string, name: string) => ({
    isPending: false,
    fetchStatus: 'idle',
    data: {
      workspace: name === 'docs' ? docs : infra,
      mirrors: [],
      storage: {
        mirrorsBytes: 3 * 1024 ** 3,
        sessionsBytes: 1024 ** 3,
        volumeSize: '15Gi',
      },
      sessionDirectories:
        name === 'docs'
          ? [
              { session: 's1', name: 'Fix the flaky test', sizeBytes: 1 },
              { session: 's2', sizeBytes: 1 },
            ]
          : [],
    },
  }),
}));

function data(overrides: Partial<WorkspacesData> = {}): WorkspacesData {
  return {
    isAvailable: true,
    installations: ['gazelle'],
    sharedIdentity: [],
    organizations: ['alpha'],
    organization: 'alpha',
    setOrganization: jest.fn(),
    rows: [docs, infra],
    isLoading: false,
    failures: {},
    signIns: [],
    retry: jest.fn(),
    ...overrides,
  };
}

function renderPanel(search = '') {
  return renderInTestApp(<CustomizeWorkspacesPanel search={search} />, {
    mountedRoutes: { '/customize/workspaces': workspacesRouteRef },
  });
}

describe('CustomizeWorkspacesPanel', () => {
  beforeEach(() => {
    mockData = data();
    jest.clearAllMocks();
  });

  it('lists the workspaces with their sources, repositories, storage, last sync and Sessions', async () => {
    await renderPanel();

    const row = screen.getByRole('row', { name: /docs/ });
    expect(
      within(row).getByText('example-org · topic docs'),
    ).toBeInTheDocument();
    expect(within(row).getByText('12')).toBeInTheDocument();
    expect(
      within(row).getByText(/4(\.0)? GiB of 15 GiB|4(\.0)? GB of 15 GiB/),
    ).toBeInTheDocument();
    expect(within(row).getByText('Synchronized')).toBeInTheDocument();
    expect(within(row).getByText('2')).toBeInTheDocument();

    const failed = screen.getByRole('row', { name: /infra/ });
    expect(within(failed).getByText('Failed')).toBeInTheDocument();
    // A manager whose list does not carry the stored size: none, no read per row.
    expect(within(failed).getByText('—')).toBeInTheDocument();
  });

  it('says when the last sync happened, and why it failed, behind the state’s info hint', async () => {
    const user = userEvent.setup();
    await renderPanel();

    // react-aria opens a tooltip on hover only once it has seen the pointer
    // move over the page.
    await user.hover(document.body);
    await user.hover(
      screen.getByRole('button', { name: 'About the state of infra' }),
    );
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      /^Failed .+ ago\.\s*owner not reachable$/,
    );
  });

  it('takes what the volume stores from the list where the manager answers it, ↑ when the last sync grew the share', async () => {
    mockData = data({
      rows: [
        {
          ...docs,
          storedBytes: 9 * 1024 ** 3,
          volumeSize: '16Gi',
          grewFrom: '8Gi',
        },
      ],
    });
    await renderPanel();

    const row = screen.getByRole('row', { name: /docs/ });
    expect(within(row).getByText(/ of 16 GiB ↑$/)).toBeInTheDocument();
    expect(
      within(row).getByText('Grown from 8 GiB at the last synchronization'),
    ).toBeInTheDocument();
  });

  it('shows the loading state while nothing is read yet', async () => {
    mockData = data({ rows: [], isLoading: true });
    await renderPanel();

    // The label follows the progress bar after a short delay.
    expect(
      await screen.findByText('Reading your workspaces…'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('shows the empty state with Create workspace, opening the editor for the Organization', async () => {
    mockData = data({ rows: [] });
    await renderPanel();

    expect(screen.getByText('No workspaces in alpha yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'New workspace' })).toHaveAttribute(
      'href',
      '/customize/workspaces/new?installation=gazelle&organization=alpha',
    );
  });

  it('says so where no environment in scope has the workspace-manager', async () => {
    mockData = data({ isAvailable: false, installations: [], rows: [] });
    await renderPanel();

    expect(
      screen.getByText('Workspaces are not available here'),
    ).toBeInTheDocument();
  });

  it('says why where the workspace-manager is withheld for want of a per-user sign-in', async () => {
    mockData = data({
      isAvailable: false,
      installations: [],
      sharedIdentity: ['golem'],
      rows: [],
    });
    await renderPanel();

    expect(
      screen.getByText('Workspaces cannot be used on golem from this portal'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Workspaces are managed through workspace-manager as you, and muster on golem has no per-user sign-in in this portal/,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('Workspaces are not available here')).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('names the environments without per-user sign-in above the workspaces of the others', async () => {
    mockData = data({ sharedIdentity: ['golem'] });
    await renderPanel();

    expect(
      screen.getByText('Workspaces cannot be used on golem from this portal'),
    ).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /docs/ })).toBeInTheDocument();
  });

  it('keeps loading while the Organizations are still read, saying nothing about membership', async () => {
    mockData = data({
      rows: [],
      organizations: [],
      organization: undefined,
      isLoading: true,
    });
    await renderPanel();

    expect(
      await screen.findByText('Reading your workspaces…'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('No Organization to show workspaces of'),
    ).toBeNull();
  });

  it('says so to a person in no Organization', async () => {
    mockData = data({ rows: [], organizations: [], organization: undefined });
    await renderPanel();

    expect(
      screen.getByText('No Organization to show workspaces of'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'New workspace' })).toBeNull();
  });

  it('lists the rest and names the installation it could not read', async () => {
    mockData = data({
      installations: ['gazelle', 'golem'],
      failures: { golem: 'Its muster could not be reached.' },
    });
    await renderPanel();

    expect(
      screen.getByText(
        'Workspaces on golem could not be read; the list shows the rest',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText('golem: Its muster could not be reached.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /docs/ })).toBeInTheDocument();
  });

  it('shows the error with a way to try again when nothing could be read', async () => {
    mockData = data({
      rows: [],
      failures: { gazelle: 'list workspaces: the manager is down' },
    });
    await renderPanel();

    expect(
      screen.getByText('Your workspaces could not be read'),
    ).toBeInTheDocument();
    expect(screen.queryByText('No workspaces in alpha yet')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(mockData.retry).toHaveBeenCalled();
  });

  it('offers the sign-in to workspace-manager, not muster’s refusal, where the person has not signed in to it', async () => {
    mockData = data({
      rows: [],
      failures: {
        gazelle:
          "agent-platform: auth_required: server 'workspace-manager' requires authentication before its tools can be called",
      },
      signIns: ['gazelle'],
    });
    await renderPanel();

    expect(screen.getByTestId('sign-in-gazelle')).toBeInTheDocument();
    expect(screen.queryByText('Your workspaces could not be read')).toBeNull();
    expect(screen.queryByText(/auth_required/)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'signed in' }));
    expect(mockData.retry).toHaveBeenCalled();
  });

  it('names the unreachable muster, not a missing workspace-manager, where no muster answered', async () => {
    mockData = data({
      isAvailable: undefined,
      installations: [],
      rows: [],
      organizations: [],
      organization: undefined,
      failures: { gazelle: 'Its muster could not be reached.' },
    });
    await renderPanel();

    expect(
      screen.getByText('Your workspaces could not be read'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Workspaces are not available here')).toBeNull();
    expect(screen.queryByText('Reading your workspaces…')).toBeNull();
  });

  it('sums a source up as its owner and the repositories it selects, its lists in full on the workspace page', async () => {
    const picked: WorkspaceRow = {
      ...docs,
      id: 'gazelle/portal',
      name: 'portal',
      sources: [
        {
          provider: 'github',
          owner: 'example-org',
          repositories: Array.from({ length: 7 }, (_, i) => `app-${i + 1}`),
          exclude: Array.from({ length: 8 }, (_, i) => `old-${i + 1}`),
        },
      ],
    };
    mockData = data({ rows: [picked] });
    await renderPanel();

    const row = screen.getByRole('row', { name: /portal/ });
    expect(
      within(row).getByText('example-org · 7 repositories'),
    ).toBeInTheDocument();
    expect(within(row).queryByText(/app-1|old-1/)).toBeNull();
  });

  it('says when the search matches nothing', async () => {
    await renderPanel('nothing-like-it');

    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByText(/nothing-like-it/)).toBeInTheDocument();
  });

  it('links the name to the workspace page', async () => {
    await renderPanel();

    expect(screen.getByRole('link', { name: 'docs' })).toHaveAttribute(
      'href',
      '/customize/workspaces/gazelle/alpha/docs',
    );
  });

  it('offers Edit, Synchronize and Delete, and no Open beside the name link', async () => {
    await renderPanel();

    await userEvent.click(
      screen.getByRole('button', { name: 'Actions for docs' }),
    );
    expect(screen.queryByRole('menuitem', { name: 'Open' })).toBeNull();
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toHaveAttribute(
      'href',
      '/customize/workspaces/gazelle/alpha/docs/edit',
    );
    await userEvent.click(
      screen.getByRole('menuitem', { name: 'Synchronize…' }),
    );
    // After the last synchronization the row shows.
    expect(mockSync.mutate).toHaveBeenCalledWith(
      { after: '2026-10-14T03:00:00Z' },
      expect.anything(),
    );
  });

  it('says Synchronizing and offers no Synchronize while a synchronization the person started is under way, as the workspace’s page does', async () => {
    mockData = data({
      rows: [
        {
          ...docs,
          awaitedSync: {
            cause: 'requested',
            after: docs.lastSync!.time,
            since: Date.now(),
          },
        },
      ],
    });
    await renderPanel();

    const row = screen.getByRole('row', { name: /docs/ });
    expect(within(row).getByText('Synchronizing')).toBeInTheDocument();
    expect(within(row).queryByText('Synchronized')).toBeNull();
    await userEvent.click(
      screen.getByRole('button', { name: 'Actions for docs' }),
    );
    expect(
      screen.getByRole('menuitem', { name: 'Synchronize…' }),
    ).toHaveAttribute('aria-disabled', 'true');
  });

  it('says Synchronizing after a saved change, and leaves Synchronize… to the person while the manager reports no sync', async () => {
    mockData = data({
      rows: [
        {
          ...docs,
          awaitedSync: {
            cause: 'changed',
            after: docs.lastSync!.time,
            since: Date.now(),
          },
        },
      ],
    });
    await renderPanel();

    const row = screen.getByRole('row', { name: /docs/ });
    expect(within(row).getByText('Synchronizing')).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Actions for docs' }),
    );
    expect(
      screen.getByRole('menuitem', { name: 'Synchronize…' }),
    ).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('confirms a delete, naming the workspace and the Sessions still using it', async () => {
    await renderPanel();

    await userEvent.click(
      screen.getByRole('button', { name: 'Actions for docs' }),
    );
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete…' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Delete docs?')).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        'Its synchronization stops and no new session can start on it.',
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        /2 sessions still use it; each keeps its directory/,
      ),
    ).toBeInTheDocument();
    expect(within(dialog).getByText('Fix the flaky test')).toBeInTheDocument();
    // A Session kagent names no title for goes by its id.
    expect(within(dialog).getByText('s2')).toBeInTheDocument();

    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Delete workspace' }),
    );
    expect(mockRemove.mutate).toHaveBeenCalled();
  });
});
