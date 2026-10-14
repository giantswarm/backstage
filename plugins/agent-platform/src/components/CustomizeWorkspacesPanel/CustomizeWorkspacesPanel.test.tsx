import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import type { WorkspaceRow } from '../../lib/workspaceList';
import type { WorkspacesData } from '../WorkspacesDataProvider';
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
    organizations: ['alpha'],
    organization: 'alpha',
    setOrganization: jest.fn(),
    rows: [docs, infra],
    isLoading: false,
    failures: {},
    retry: jest.fn(),
    ...overrides,
  };
}

function renderPanel(search = '') {
  return renderInTestApp(<CustomizeWorkspacesPanel search={search} />);
}

describe('CustomizeWorkspacesPanel', () => {
  beforeEach(() => {
    mockData = data();
    jest.clearAllMocks();
  });

  it('lists the workspaces with their sources, repositories, storage, last sync and Sessions', async () => {
    await renderPanel();

    const row = screen.getByRole('row', { name: /docs/ });
    expect(within(row).getByText('github: example-org · topic docs')).toBeInTheDocument();
    expect(within(row).getByText('12')).toBeInTheDocument();
    expect(within(row).getByText(/4(\.0)? GiB of 15Gi|4(\.0)? GB of 15Gi/)).toBeInTheDocument();
    expect(within(row).getByText('Synced')).toBeInTheDocument();
    expect(within(row).getByText('2')).toBeInTheDocument();

    const failed = screen.getByRole('row', { name: /infra/ });
    expect(within(failed).getByText('Failed')).toBeInTheDocument();
  });

  it('shows the loading state while nothing is read yet', async () => {
    mockData = data({ rows: [], isLoading: true });
    await renderPanel();

    expect(screen.getByText('Reading your workspaces…')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('shows the empty state with Create workspace, not offered until the editor exists', async () => {
    mockData = data({ rows: [] });
    await renderPanel();

    expect(screen.getByText('No workspaces in alpha yet')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Create workspace' }),
    ).toBeDisabled();
    expect(screen.getByText('Coming with the workspace page.')).toBeInTheDocument();
  });

  it('says so to a person in no Organization', async () => {
    mockData = data({ rows: [], organizations: [], organization: undefined });
    await renderPanel();

    expect(
      screen.getByText('No Organization to show workspaces of'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create workspace' })).toBeNull();
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
    expect(screen.getByText('golem: Its muster could not be reached.')).toBeInTheDocument();
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

  it('says when the search matches nothing', async () => {
    await renderPanel('nothing-like-it');

    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByText(/nothing-like-it/)).toBeInTheDocument();
  });

  it('offers Sync now and Delete, and Open and Edit only once the workspace page exists', async () => {
    await renderPanel();

    await userEvent.click(
      screen.getByRole('button', { name: 'Actions for docs' }),
    );
    expect(screen.getByRole('menuitem', { name: 'Open' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await userEvent.click(screen.getByRole('menuitem', { name: 'Sync now' }));
    expect(mockSync.mutate).toHaveBeenCalled();
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
        'Its sync stops and no new Session can start on it.',
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(/2 Sessions still use it; each keeps its directory/),
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
