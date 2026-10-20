import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { AgentRow } from '../AgentsDataProvider';
import {
  WorkspaceManagerError,
  type Workspace,
} from '../../lib/workspaceManager';
import { NewSessionComposer } from './NewSessionComposer';

jest.mock('../../hooks/useAgentAvatarUrl', () => ({
  useAgentAvatarUrl: () => () => 'https://avatars.example/agent.png',
}));

const NOW = new Date('2026-10-21T08:00:00Z');

function workspace(overrides: Partial<Workspace>): Workspace {
  return {
    name: 'platform-mix',
    organization: 'agentlab-org',
    sources: [],
    sync: { schedule: 'nightly' },
    resourceVersion: '1',
    createdAt: '2026-10-01T00:00:00Z',
    repositories: 9,
    sessions: 0,
    lastSync: { time: '2026-10-21T04:00:00Z', result: 'Succeeded' },
    ...overrides,
  };
}

const mix = workspace({});
const mcp = workspace({ name: 'platform-mcp', repositories: 1 });

/** The workspaces each installation offers; none unless a test says so. */
const mockWorkspacesOf = jest.fn<Workspace[], [string]>(() => []);
jest.mock('../../hooks/useSessionWorkspaces', () => ({
  ...jest.requireActual('../../hooks/useSessionWorkspaces'),
  useSessionWorkspaces: (installation: string) => ({
    workspaces: mockWorkspacesOf(installation),
    isLoading: false,
  }),
}));

jest.mock('../../hooks/useWorkspaceManager', () => ({
  ...jest.requireActual('../../hooks/useWorkspaceManager'),
  useWorkspaceManagerClient: () => undefined,
}));
jest.mock('../../hooks/useWorkspaceEditor', () => ({
  useWorkspaceProviders: () => ({
    data: [{ name: 'github', kind: 'github', connected: false }],
  }),
}));

/** muster's sign-in for the provider's App, as the test moves it along. */
const mockSignIn = {
  isWaiting: false,
  isConnected: false,
  isPending: false,
  signInTabOpened: false,
  authUrl: 'https://muster.example/sign-in',
  error: undefined as string | undefined,
  signIn: jest.fn(),
};
jest.mock('@giantswarm/backstage-plugin-muster', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-muster'),
  ServerSignIn: () => null,
  useServerSignIn: () => mockSignIn,
}));

function agentRow(overrides: Partial<AgentRow> = {}): AgentRow {
  return {
    id: 'gazelle/kagent/claude-code',
    installation: 'gazelle',
    namespace: 'kagent',
    name: 'Claude Code',
    technicalName: 'claude-code',
    description: 'Writes and changes code',
    skillCount: 0,
    readiness: 'ready',
    ...overrides,
  };
}

const claude = agentRow();
const onStart = jest.fn();

function renderComposer(
  props: Partial<Parameters<typeof NewSessionComposer>[0]> = {},
) {
  const all = {
    agents: [claude],
    isStarting: false,
    onStart,
    offersWorkspaces: true,
    ...props,
  };
  const view = render(<NewSessionComposer {...all} />);
  return {
    ...view,
    rerenderWith: (next: Partial<Parameters<typeof NewSessionComposer>[0]>) =>
      view.rerender(<NewSessionComposer {...all} {...next} />),
  };
}

const field = () => screen.getByRole('textbox', { name: 'Prompt' });
const startButton = () => screen.getByRole('button', { name: 'Start' });
const workspacePicker = () => screen.getByRole('button', { name: /Workspace/ });

beforeEach(() => {
  jest.useFakeTimers({ now: NOW, advanceTimers: true });
  window.localStorage.clear();
  onStart.mockReset();
  mockWorkspacesOf.mockReset();
  mockWorkspacesOf.mockReturnValue([]);
  Object.assign(mockSignIn, { isWaiting: false, isConnected: false });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('NewSessionComposer workspaces', () => {
  it('offers the agent’s installation’s workspaces with their size and last sync', async () => {
    mockWorkspacesOf.mockReturnValue([mcp, mix]);
    renderComposer();

    expect(mockWorkspacesOf).toHaveBeenCalledWith('gazelle');
    expect(workspacePicker()).toHaveTextContent('No workspace');
    await userEvent.click(workspacePicker());
    const listbox = screen.getByRole('listbox');
    expect(
      within(listbox)
        .getAllByRole('option')
        .map(option => option.textContent),
    ).toEqual([
      'platform-mcp1 repository · synced 4 h ago',
      'platform-mix9 repositories · synced 4 h ago',
      'No workspace',
    ]);
  });

  it('starts in the chosen workspace and presets it next time with this agent', async () => {
    mockWorkspacesOf.mockReturnValue([mcp, mix]);
    const { unmount } = renderComposer();

    await userEvent.click(workspacePicker());
    await userEvent.click(screen.getByRole('option', { name: /platform-mix/ }));
    await userEvent.type(field(), 'List the repositories');
    await userEvent.click(startButton());

    expect(onStart).toHaveBeenCalledWith(
      claude,
      'List the repositories',
      [],
      'platform-mix',
    );

    unmount();
    renderComposer();
    expect(workspacePicker()).toHaveTextContent('platform-mix');
    expect(screen.getByText('Last used with Claude Code')).toBeInTheDocument();
  });

  it('remembers "No workspace" too', async () => {
    mockWorkspacesOf.mockReturnValue([mix]);
    window.localStorage.setItem(
      'gs-agent-platform-last-workspace',
      JSON.stringify({ [claude.id]: 'platform-mix' }),
    );
    const { unmount } = renderComposer();
    expect(workspacePicker()).toHaveTextContent('platform-mix');

    await userEvent.click(workspacePicker());
    await userEvent.click(screen.getByRole('option', { name: 'No workspace' }));
    unmount();
    renderComposer();

    expect(workspacePicker()).toHaveTextContent('No workspace');
  });

  it('is not there where the installation offers no workspace', () => {
    renderComposer();

    expect(screen.queryByRole('button', { name: /Workspace/ })).toBeNull();
  });

  it('never appears without offersWorkspaces, as on agent creation', () => {
    mockWorkspacesOf.mockReturnValue([mix]);
    renderComposer({ offersWorkspaces: false });

    expect(screen.queryByRole('button', { name: /Workspace/ })).toBeNull();
    expect(mockWorkspacesOf).not.toHaveBeenCalled();
  });

  it('says the access check while the start runs', async () => {
    mockWorkspacesOf.mockReturnValue([mix]);
    window.localStorage.setItem(
      'gs-agent-platform-last-workspace',
      JSON.stringify({ [claude.id]: 'platform-mix' }),
    );
    const { rerenderWith } = renderComposer();
    await userEvent.type(field(), 'List the repositories');
    await userEvent.click(startButton());
    rerenderWith({ isStarting: true });

    expect(screen.getByRole('status')).toHaveTextContent(
      'Checking access to platform-mix…',
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'Then your directory is prepared: 9 repositories. Seconds.',
    );
  });

  it('names every unreadable repository on a refusal, keeps the prompt, and starts without the workspace on request', async () => {
    mockWorkspacesOf.mockReturnValue([mix]);
    window.localStorage.setItem(
      'gs-agent-platform-last-workspace',
      JSON.stringify({ [claude.id]: 'platform-mix' }),
    );
    const { rerenderWith } = renderComposer();
    await userEvent.type(field(), 'List the repositories');
    await userEvent.click(startButton());
    rerenderWith({
      error: new WorkspaceManagerError('refused', 'refused', [
        'agentlab-org/secret-api',
        'agentlab-org/billing',
      ]),
    });

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(
      'You cannot read 2 repositories of platform-mix',
    );
    expect(alert).toHaveTextContent(
      'agentlab-org/secret-api, agentlab-org/billing',
    );
    expect(screen.queryByText('Session not started')).toBeNull();
    expect(field()).toHaveValue('List the repositories');

    onStart.mockClear();
    await userEvent.click(
      within(alert).getByRole('button', { name: 'Start without workspace' }),
    );
    expect(onStart).toHaveBeenCalledWith(claude, 'List the repositories', []);
    expect(workspacePicker()).toHaveTextContent('No workspace');
  });

  it('says a workspace that has not synced yet', async () => {
    mockWorkspacesOf.mockReturnValue([mix]);
    window.localStorage.setItem(
      'gs-agent-platform-last-workspace',
      JSON.stringify({ [claude.id]: 'platform-mix' }),
    );
    const { rerenderWith } = renderComposer();
    await userEvent.type(field(), 'List the repositories');
    await userEvent.click(startButton());
    rerenderWith({
      error: new WorkspaceManagerError(
        'refused',
        'workspace platform-mix has not synced yet',
      ),
    });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'platform-mix cannot be used yet',
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'workspace platform-mix has not synced yet',
    );
  });

  it('shows the provider sign-in for an unconnected provider and starts again once connected', async () => {
    mockWorkspacesOf.mockReturnValue([mix]);
    window.localStorage.setItem(
      'gs-agent-platform-last-workspace',
      JSON.stringify({ [claude.id]: 'platform-mix' }),
    );
    const { rerenderWith } = renderComposer();
    await userEvent.type(field(), 'List the repositories');
    await userEvent.click(startButton());
    const notConnected = new WorkspaceManagerError(
      'not_connected',
      'sign in to github first',
      [],
      [{ provider: 'github', signIn: 'core_auth_login server=github-app' }],
    );
    rerenderWith({ error: notConnected });

    const card = screen.getByTestId('workspace-connect-github');
    expect(card).toHaveTextContent('Sign in to GitHub to use platform-mix');
    await userEvent.click(
      within(card).getByRole('button', { name: /Continue with GitHub/ }),
    );
    expect(mockSignIn.signIn).toHaveBeenCalled();

    onStart.mockClear();
    mockSignIn.isWaiting = true;
    rerenderWith({ error: notConnected });
    expect(card).toHaveTextContent(
      'The session starts as soon as you are back.',
    );
    mockSignIn.isWaiting = false;
    mockSignIn.isConnected = true;
    rerenderWith({ error: notConnected });

    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onStart).toHaveBeenCalledWith(
      claude,
      'List the repositories',
      [],
      'platform-mix',
    );
  });
});
