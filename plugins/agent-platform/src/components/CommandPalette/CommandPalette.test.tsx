import type { ReactNode } from 'react';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  agentsRouteRef,
  musterServersExternalRouteRef,
  sessionsRouteRef,
  skillsRouteRef,
} from '../../routes';
import type { AgentRow } from '../AgentsDataProvider';
import type { SessionRow } from '../SessionsDataProvider';
import { CommandPalette } from './CommandPalette';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

// The providers fetch fleet-wide; the palette's own logic is what this file
// covers, so each data source is handed in directly.
jest.mock('../AgentPlatformProviders', () => ({
  AgentPlatformProviders: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}));

const agent: AgentRow = {
  id: 'gazelle/kagent/support-triage',
  installation: 'gazelle',
  namespace: 'kagent',
  name: 'Support Triage',
  technicalName: 'support-triage',
  description: 'Topics: Login and SSO, Billing, Cluster upgrades',
  skillCount: 0,
  readiness: 'ready',
} as AgentRow;

let mockAgents: {
  rows: AgentRow[];
  installations: string[];
  isLoading: boolean;
  isLoadingMore: boolean;
};
jest.mock('../AgentsDataProvider', () => ({
  useAgents: () => mockAgents,
}));

function session(id: string, title: string, agentName = ''): SessionRow {
  return {
    id: `gazelle/${id}`,
    sessionId: id,
    installation: 'gazelle',
    title,
    agentName,
    createdAt: '2026-10-03T10:00:00Z',
  } as SessionRow;
}

let mockSessions: {
  rows: SessionRow[];
  isLoading: boolean;
  isLoadingMore: boolean;
};
jest.mock('../SessionsDataProvider', () => ({
  useSessions: () => mockSessions,
}));

let mockCatalog: {
  skills: {
    name: string;
    description: string;
    repoUrl: string;
    path: string;
    ref: string;
    commit: string;
  }[];
  isLoading: boolean;
};
jest.mock('../../hooks/useSkillCatalog', () => ({
  useSkillCatalog: () => mockCatalog,
}));

let mockConnectors: {
  rows: { page: string; installations: string[] }[];
  isLoading: boolean;
};
jest.mock('./usePaletteConnectors', () => ({
  usePaletteConnectors: () => mockConnectors,
}));

const mockCreateSession = jest.fn();
const mockEntryPoints: string[] = [];
jest.mock('../../hooks/useCreateSession', () => ({
  useCreateSession: (entryPoint: string) => {
    mockEntryPoints.push(entryPoint);
    return {
      createSession: mockCreateSession,
      isCreating: false,
      error: null,
      reset: jest.fn(),
    };
  },
}));

// The composer drags in the full agent picker; the palette's wiring to it —
// which agent it preselects, what happens on start — is what this file covers.
jest.mock('../NewSessionDialog', () => ({
  NewSessionDialog: ({
    isOpen,
    defaultAgent,
    onStart,
  }: {
    isOpen: boolean;
    defaultAgent?: AgentRow;
    onStart: (chosen: AgentRow, prompt: string) => void;
  }) =>
    isOpen ? (
      <div>
        <div>Composer for {defaultAgent?.name}</div>
        <button
          type="button"
          onClick={() => onStart(defaultAgent!, 'Check the SSO setup')}
        >
          Start test session
        </button>
      </div>
    ) : null,
}));

function renderPalette() {
  return renderInTestApp(
    <>
      <label htmlFor="outside">Outside field</label>
      <input id="outside" />
      <CommandPalette
        renderTrigger={open => (
          <button type="button" onClick={open}>
            Open search
          </button>
        )}
      />
    </>,
    {
      mountedRoutes: {
        '/agent-platform/sessions': sessionsRouteRef,
        '/agent-platform/agents': agentsRouteRef,
        '/agent-platform/skills': skillsRouteRef,
        '/agent-platform/connectors': musterServersExternalRouteRef,
      },
    },
  );
}

async function openPalette() {
  await renderPalette();
  await userEvent.click(screen.getByRole('button', { name: 'Open search' }));
  return screen.findByRole('combobox', {
    name: 'Search sessions, agents, skills and connectors',
  });
}

beforeEach(() => {
  mockNavigate.mockClear();
  mockCreateSession.mockReset();
  mockCreateSession.mockResolvedValue('new-session-id');
  mockEntryPoints.length = 0;
  delete document.documentElement.dataset.agentShell;

  mockAgents = {
    rows: [agent],
    installations: ['gazelle'],
    isLoading: false,
    isLoadingMore: false,
  };
  mockSessions = {
    rows: [
      session(
        's-sso',
        'Which customers asked about SSO this month?',
        'Support Triage',
      ),
      session('s-notes', 'Write release notes for v29.1'),
    ],
    isLoading: false,
    isLoadingMore: false,
  };
  mockCatalog = {
    skills: [
      {
        name: 'Ticket triage',
        description: 'Pick one topic: Login and SSO, Billing',
        repoUrl: 'https://github.com/giantswarm/skills',
        path: 'ticket-triage',
        ref: 'main',
        commit: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
      },
    ],
    isLoading: false,
  };
  mockConnectors = {
    rows: [{ page: 'confluence', installations: ['gazelle'] }],
    isLoading: false,
  };
});

describe('CommandPalette', () => {
  it('opens from the trigger and closes on Escape', async () => {
    const input = await openPalette();
    expect(input).toBeVisible();

    await userEvent.keyboard('{Escape}');
    await waitFor(() =>
      expect(
        screen.queryByRole('combobox', {
          name: 'Search sessions, agents, skills and connectors',
        }),
      ).not.toBeInTheDocument(),
    );
  });

  it('opens on the keyboard shortcut only inside the agent shell', async () => {
    await renderPalette();

    // Outside the shell (no data-agent-shell on the root): nothing.
    fireEvent.keyDown(document.body, { key: 'k', metaKey: true });
    expect(
      screen.queryByRole('combobox', {
        name: 'Search sessions, agents, skills and connectors',
      }),
    ).not.toBeInTheDocument();

    document.documentElement.dataset.agentShell = '';
    fireEvent.keyDown(document.body, { key: 'k', metaKey: true });
    expect(
      await screen.findByRole('combobox', {
        name: 'Search sessions, agents, skills and connectors',
      }),
    ).toBeVisible();
  });

  it('does not fire the shortcut from inside an input', async () => {
    await renderPalette();
    document.documentElement.dataset.agentShell = '';

    const outside = screen.getByLabelText('Outside field');
    outside.focus();
    fireEvent.keyDown(outside, { key: 'k', ctrlKey: true });

    expect(
      screen.queryByRole('combobox', {
        name: 'Search sessions, agents, skills and connectors',
      }),
    ).not.toBeInTheDocument();
  });

  it('groups matches by kind, titles and metadata only', async () => {
    const input = await openPalette();
    await userEvent.type(input, 'sso');

    const listbox = screen.getByRole('listbox', { name: 'Results' });
    expect(within(listbox).getByText('Sessions')).toBeVisible();
    expect(
      within(listbox).getByText('Which customers asked about SSO this month?'),
    ).toBeVisible();
    // The agent matches through its description.
    expect(within(listbox).getByText('Support Triage')).toBeVisible();
    // The skill matches through its description too.
    expect(within(listbox).getByText('Ticket triage')).toBeVisible();
    // No match: not listed.
    expect(
      within(listbox).queryByText('Write release notes for v29.1'),
    ).not.toBeInTheDocument();
    expect(within(listbox).queryByText('confluence')).not.toBeInTheDocument();
  });

  it('narrows to one kind through the filter chips', async () => {
    const input = await openPalette();
    await userEvent.type(input, 'sso');
    await userEvent.click(screen.getByRole('button', { name: 'Agents' }));

    const listbox = screen.getByRole('listbox', { name: 'Results' });
    expect(within(listbox).getByText('Support Triage')).toBeVisible();
    expect(
      within(listbox).queryByText(
        'Which customers asked about SSO this month?',
      ),
    ).not.toBeInTheDocument();
  });

  it('walks the results with the arrow keys and opens with Enter', async () => {
    const input = await openPalette();
    await userEvent.type(input, 'sso');

    // First result (the session) is active; move to the agent.
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    const active = document.getElementById(
      input.getAttribute('aria-activedescendant')!,
    );
    expect(active).toHaveTextContent('Support Triage');

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(mockNavigate).toHaveBeenCalledWith(
      '/agent-platform/agents/gazelle/kagent/support-triage',
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('listbox', { name: 'Results' }),
      ).not.toBeInTheDocument(),
    );
  });

  it('opens a clicked result', async () => {
    const input = await openPalette();
    await userEvent.type(input, 'confluence');

    await userEvent.click(screen.getByText('confluence'));
    expect(mockNavigate).toHaveBeenCalledWith(
      '/agent-platform/connectors/confluence',
    );
  });

  it('starts a session with the active agent on ⌘↵, tracked as searchPalette', async () => {
    const input = await openPalette();
    await userEvent.type(input, 'sso');
    fireEvent.keyDown(input, { key: 'ArrowDown' }); // onto the agent
    fireEvent.keyDown(input, { key: 'Enter', metaKey: true });

    // The palette hands over to the composer, preselecting the agent.
    expect(
      await screen.findByText('Composer for Support Triage'),
    ).toBeVisible();
    expect(mockEntryPoints).toContain('searchPalette');

    await userEvent.click(
      screen.getByRole('button', { name: 'Start test session' }),
    );
    await waitFor(() =>
      expect(mockCreateSession).toHaveBeenCalledWith({
        agent,
        prompt: 'Check the SSO setup',
      }),
    );
    expect(mockNavigate).toHaveBeenCalledWith(
      '/agent-platform/sessions/gazelle/new-session-id',
      {
        state: {
          newSession: {
            text: 'Check the SSO setup',
            agentNamespace: 'kagent',
            agentName: 'support-triage',
          },
        },
      },
    );
  });

  it('ignores ⌘↵ on a result that is not an agent', async () => {
    const input = await openPalette();
    await userEvent.type(input, 'sso');

    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true }); // session row
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(
      screen.queryByText('Composer for Support Triage'),
    ).not.toBeInTheDocument();
  });

  it('always offers the portal-wide search for the typed query', async () => {
    const input = await openPalette();
    await userEvent.type(input, 'sso login');

    await userEvent.click(
      screen.getByText('Search the whole portal for “sso login”'),
    );
    expect(mockNavigate).toHaveBeenCalledWith('/search?query=sso%20login');
  });

  it('says honestly when nothing matches, keeping the portal search', async () => {
    const input = await openPalette();
    await userEvent.type(input, 'zzz-no-such-thing');

    expect(
      screen.getByText(
        'Nothing in your sessions, agents, skills or connectors matches “zzz-no-such-thing”.',
      ),
    ).toBeVisible();
  });
});
