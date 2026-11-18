import type { ReactNode } from 'react';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  customizeExternalRouteRef,
  agentsRouteRef,
  modelsRouteRef,
  musterServerExternalRouteRef,
  musterWorkflowDetailExternalRouteRef,
  sessionsRouteRef,
  skillsRouteRef,
} from '../../routes';
import type { AgentRow } from '../AgentsDataProvider';
import type { SessionRow } from '../SessionsDataProvider';
import { CommandPalette } from './CommandPalette';
import {
  mockDesktopLayout,
  mockPhoneLayout,
  type MockedLayout,
} from '@giantswarm/backstage-plugin-ui-react/testUtils';

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
// Subscribed, so a test can have sessions arrive while the palette is open.
const mockSessionsListeners = new Set<() => void>();
jest.mock('../SessionsDataProvider', () => ({
  useSessions: () =>
    jest.requireActual('react').useSyncExternalStore(
      (listener: () => void) => {
        mockSessionsListeners.add(listener);
        return () => mockSessionsListeners.delete(listener);
      },
      () => mockSessions,
    ),
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
  rows: { page: string; displayName: string; installation: string }[];
  isLoading: boolean;
};
jest.mock('./usePaletteConnectors', () => ({
  usePaletteConnectors: () => mockConnectors,
}));

let mockModels: {
  rows: {
    id: string;
    installation: string;
    namespace: string;
    name: string;
    displayName: string;
    description?: string;
  }[];
  isLoading: boolean;
};
jest.mock('./usePaletteModels', () => ({
  usePaletteModels: () => mockModels,
}));

let mockWorkflows: {
  rows: { name: string; description?: string; installation: string }[];
  isLoading: boolean;
};
jest.mock('./usePaletteWorkflows', () => ({
  usePaletteWorkflows: () => mockWorkflows,
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
  PHONE_FULL_SCREEN_DIALOG: jest.requireActual(
    '../NewSessionDialog/phoneDialog',
  ).PHONE_FULL_SCREEN_DIALOG,
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
        '/sessions': sessionsRouteRef,
        '/customize/agents': agentsRouteRef,
        '/customize/skills': skillsRouteRef,
        '/customize/connectors/:installation/:server':
          musterServerExternalRouteRef,
        '/customize/models': modelsRouteRef,
        '/customize': customizeExternalRouteRef,
        '/customize/workflows/:installation/:name':
          musterWorkflowDetailExternalRouteRef,
      },
    },
  );
}

async function openPalette() {
  await renderPalette();
  await userEvent.click(screen.getByRole('button', { name: 'Open search' }));
  return screen.findByRole('combobox', {
    name: 'Search sessions, agents, skills, connectors, models and workflows',
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
    rows: [
      {
        page: 'confluence',
        displayName: 'confluence',
        installation: 'gazelle',
      },
    ],
    isLoading: false,
  };
  mockModels = {
    rows: [
      {
        id: 'gazelle/kagent/default-model',
        installation: 'gazelle',
        namespace: 'kagent',
        name: 'default-model',
        displayName: 'Default model',
        description: 'OpenAI · gpt-4o',
      },
    ],
    isLoading: false,
  };
  mockWorkflows = {
    rows: [
      {
        name: 'release-readiness',
        description: 'Checks a release before it ships',
        installation: 'gazelle',
      },
    ],
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
          name: 'Search sessions, agents, skills, connectors, models and workflows',
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
        name: 'Search sessions, agents, skills, connectors, models and workflows',
      }),
    ).not.toBeInTheDocument();

    document.documentElement.dataset.agentShell = '';
    fireEvent.keyDown(document.body, { key: 'k', metaKey: true });
    expect(
      await screen.findByRole('combobox', {
        name: 'Search sessions, agents, skills, connectors, models and workflows',
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
        name: 'Search sessions, agents, skills, connectors, models and workflows',
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

  it('dates a session by its local creation day, with the year only when it is another', async () => {
    mockSessions = {
      ...mockSessions,
      rows: [
        {
          ...session('s-new', 'Rotate the SSO keys'),
          createdAt: new Date().toISOString(),
        },
        {
          ...session('s-old', 'Audit the SSO groups'),
          createdAt: new Date(2025, 9, 3, 12).toISOString(),
        },
      ],
    };
    const input = await openPalette();
    await userEvent.type(input, 'sso');

    const listbox = screen.getByRole('listbox', { name: 'Results' });
    const optionOf = (title: string) =>
      within(listbox)
        .getByText(title)
        .closest('[role="option"]') as HTMLElement;
    expect(
      within(optionOf('Rotate the SSO keys')).getByText('Today'),
    ).toBeVisible();
    expect(
      within(optionOf('Audit the SSO groups')).getByText('3 Oct 2025'),
    ).toBeVisible();
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

  it('operates the type chips from the keyboard without closing the palette', async () => {
    const input = await openPalette();
    await userEvent.type(input, 'sso');

    // Tab leaves the field for the chips: All, Sessions, then Agents.
    await userEvent.tab();
    await userEvent.tab();
    await userEvent.tab();
    const agents = screen.getByRole('button', { name: 'Agents' });
    expect(agents).toHaveFocus();
    await userEvent.keyboard('{Enter}');

    expect(agents).toHaveAttribute('aria-pressed', 'true');
    const listbox = screen.getByRole('listbox', { name: 'Results' });
    expect(within(listbox).getByText('Support Triage')).toBeVisible();
    expect(
      within(listbox).queryByText(
        'Which customers asked about SSO this month?',
      ),
    ).toBeNull();
    expect(input).toBeVisible();
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
      '/customize/agents/gazelle/kagent/support-triage',
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('listbox', { name: 'Results' }),
      ).not.toBeInTheDocument(),
    );
  });

  describe('scrolling', () => {
    // jsdom does no layout. Stack the results as 10px headings and 40px rows
    // under 4px of list padding, in a list 110px high that scrolls by its
    // real `scrollTop`.
    const PADDING = 4;
    const HEADING = 10;
    const ROW = 40;
    const LIST_HEIGHT = 110;
    let rectSpy: jest.SpyInstance;
    let heightSpy: jest.SpyInstance;

    beforeEach(() => {
      rectSpy = jest
        .spyOn(Element.prototype, 'getBoundingClientRect')
        .mockImplementation(function rect(this: Element) {
          const listbox = this.closest<HTMLElement>('[role="listbox"]');
          if (!listbox || listbox === this) {
            return { top: 0, bottom: LIST_HEIGHT } as DOMRect;
          }
          let y = PADDING - listbox.scrollTop;
          for (const each of Array.from(
            listbox.querySelectorAll(':scope > li > div, [role="option"]'),
          )) {
            const height =
              each.getAttribute('role') === 'option' ? ROW : HEADING;
            if (each === this) {
              return { top: y, bottom: y + height } as DOMRect;
            }
            y += height;
          }
          return { top: 0, bottom: 0 } as DOMRect;
        });
      heightSpy = jest
        .spyOn(Element.prototype, 'clientHeight', 'get')
        .mockImplementation(function height(this: Element) {
          return this.getAttribute('role') === 'listbox' ? LIST_HEIGHT : 0;
        });
    });

    afterEach(() => {
      rectSpy.mockRestore();
      heightSpy.mockRestore();
    });

    const results = () => screen.getByRole('listbox', { name: 'Results' });
    const activeOption = (input: HTMLElement) =>
      document.getElementById(input.getAttribute('aria-activedescendant')!)!;
    const expectActiveInView = (input: HTMLElement) => {
      const { top, bottom } = activeOption(input).getBoundingClientRect();
      expect(top).toBeGreaterThanOrEqual(0);
      expect(bottom).toBeLessThanOrEqual(LIST_HEIGHT);
    };

    // "sso" lists one row in each of three groups:
    //   Sessions 4–14, the session 14–54,
    //   Agents 54–64, Support Triage 64–104,
    //   Skills 104–114, Ticket triage 114–154.

    it('keeps the row the arrow keys move to in view, moving the list as little as it can', async () => {
      const input = await openPalette();
      await userEvent.type(input, 'sso');

      // In view already: the list stays put.
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      expect(activeOption(input)).toHaveTextContent('Support Triage');
      expect(results().scrollTop).toBe(0);

      // Below the fold: scrolled just far enough to show its bottom edge.
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      expect(activeOption(input)).toHaveTextContent('Ticket triage');
      expect(results().scrollTop).toBe(154 - LIST_HEIGHT);
      expectActiveInView(input);

      fireEvent.keyDown(input, { key: 'ArrowUp' });
      expect(results().scrollTop).toBe(154 - LIST_HEIGHT);

      // Up to a group's first row: its heading comes back with it, so the
      // list stops at the heading's top (4), not the row's (14).
      fireEvent.keyDown(input, { key: 'ArrowUp' });
      expect(activeOption(input)).toHaveTextContent(
        'Which customers asked about SSO this month?',
      );
      expect(results().scrollTop).toBe(4);
    });

    it('keeps the highlight in view when results arrive late', async () => {
      mockAgents.rows = ['Billing', 'Login', 'Upgrades'].map(topic => ({
        ...agent,
        id: `gazelle/kagent/${topic.toLowerCase()}`,
        name: `${topic} helper`,
        description: `Answers SSO and ${topic} questions`,
      }));
      mockSessions = { rows: [], isLoading: true, isLoadingMore: false };
      const input = await openPalette();
      await userEvent.type(input, 'sso');
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      expect(activeOption(input)).toHaveTextContent('Upgrades helper');
      expectActiveInView(input);

      // A Sessions group lands above the agents, and the highlight's row
      // with it moves below the fold.
      act(() => {
        mockSessions = {
          rows: [
            session('s-sso', 'Which customers asked about SSO this month?'),
          ],
          isLoading: false,
          isLoadingMore: false,
        };
        mockSessionsListeners.forEach(listener => listener());
      });
      expect(
        within(results()).getByText(
          'Which customers asked about SSO this month?',
        ),
      ).toBeInTheDocument();
      expectActiveInView(input);
    });

    it('does not scroll to a row the pointer selects, nor select a row scrolled under a resting pointer', async () => {
      const input = await openPalette();
      await userEvent.type(input, 'sso');

      fireEvent.mouseMove(screen.getByText('Ticket triage'), {
        clientX: 20,
        clientY: 105,
      });
      expect(activeOption(input)).toHaveTextContent('Ticket triage');
      expect(results().scrollTop).toBe(0);

      fireEvent.keyDown(input, { key: 'ArrowUp' });
      expect(activeOption(input)).toHaveTextContent('Support Triage');

      // A mousemove where the pointer already was: content moved under it.
      fireEvent.mouseMove(screen.getByText('Ticket triage'), {
        clientX: 20,
        clientY: 105,
      });
      expect(activeOption(input)).toHaveTextContent('Support Triage');

      fireEvent.mouseMove(screen.getByText('Ticket triage'), {
        clientX: 20,
        clientY: 110,
      });
      expect(activeOption(input)).toHaveTextContent('Ticket triage');
    });

    it('scrolls the list back to the top on a new query', async () => {
      const input = await openPalette();
      results().scrollTop = 120;

      await userEvent.type(input, 's');
      expect(results().scrollTop).toBe(0);
    });

    it('scrolls the list back to the top on another type chip', async () => {
      const input = await openPalette();
      await userEvent.type(input, 'sso');
      results().scrollTop = 120;

      await userEvent.click(screen.getByRole('button', { name: 'Agents' }));
      expect(activeOption(input)).toHaveTextContent('Support Triage');
      expect(results().scrollTop).toBe(0);
    });
  });

  it('opens a clicked result', async () => {
    const input = await openPalette();
    await userEvent.type(input, 'confluence');

    await userEvent.click(screen.getByText('confluence'));
    expect(mockNavigate).toHaveBeenCalledWith(
      '/customize/connectors/gazelle/confluence',
    );
  });

  it('names a connector by its display name, found by either name', async () => {
    mockConnectors = {
      rows: [
        {
          page: 'mcp-confluence',
          displayName: 'Team wiki',
          installation: 'gazelle',
        },
      ],
      isLoading: false,
    };
    const input = await openPalette();
    await userEvent.type(input, 'mcp-confl');

    await userEvent.click(screen.getByText('Team wiki'));
    expect(mockNavigate).toHaveBeenCalledWith(
      '/customize/connectors/gazelle/mcp-confluence',
    );
  });

  it('lists a connector once per installation, each opening there', async () => {
    mockConnectors = {
      rows: [
        { page: 'jira', displayName: 'Jira', installation: 'gazelle' },
        { page: 'jira', displayName: 'Jira', installation: 'golem' },
      ],
      isLoading: false,
    };
    const input = await openPalette();
    await userEvent.type(input, 'jira');

    expect(screen.getAllByText('Jira')).toHaveLength(2);
    await userEvent.click(screen.getAllByText('Jira')[1]);
    expect(mockNavigate).toHaveBeenCalledWith(
      '/customize/connectors/golem/jira',
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
      '/sessions/gazelle/new-session-id',
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

  it('finds a model and opens its page', async () => {
    const input = await openPalette();
    await userEvent.type(input, 'default-model');

    const listbox = screen.getByRole('listbox', { name: 'Results' });
    expect(within(listbox).getByText('Models')).toBeVisible();
    await userEvent.click(within(listbox).getByText('Default model'));
    expect(mockNavigate).toHaveBeenCalledWith(
      '/customize/models/gazelle/kagent/default-model',
    );
  });

  it('finds a workflow and opens its page on its installation', async () => {
    const input = await openPalette();
    await userEvent.type(input, 'release-readiness');

    const listbox = screen.getByRole('listbox', { name: 'Results' });
    expect(within(listbox).getByText('Workflows')).toBeVisible();
    await userEvent.click(within(listbox).getByText('release-readiness'));
    expect(mockNavigate).toHaveBeenCalledWith(
      '/customize/workflows/gazelle/release-readiness',
    );
  });

  describe('at list scale (T39)', () => {
    const chipGroup = () =>
      screen.queryByRole('group', { name: 'Filter results' });

    it('offers a chip only for the kinds that have entries', async () => {
      mockCatalog = { skills: [], isLoading: false };
      await openPalette();

      const chips = within(chipGroup()!).getAllByRole('button');
      expect(chips.map(chip => chip.textContent)).toEqual([
        'All',
        'Sessions',
        'Agents',
        'Connectors',
        'Models',
        'Workflows',
      ]);
    });

    it('offers no chips at all over a single kind', async () => {
      mockAgents = { ...mockAgents, rows: [] };
      mockCatalog = { skills: [], isLoading: false };
      mockConnectors = { rows: [], isLoading: false };
      mockModels = { rows: [], isLoading: false };
      mockWorkflows = { rows: [], isLoading: false };
      await openPalette();

      expect(chipGroup()).not.toBeInTheDocument();
      // Three sessions are listed whole: no "+N more".
      const listbox = screen.getByRole('listbox', { name: 'Results' });
      expect(within(listbox).getAllByRole('option')).toHaveLength(2);
      expect(screen.queryByText(/more$/)).not.toBeInTheDocument();
    });

    it('caps 300 sessions and links the rest to the Sessions list with the query', async () => {
      mockSessions = {
        ...mockSessions,
        rows: Array.from({ length: 300 }, (_, i) =>
          session(`s-${i}`, `Release ${i}`),
        ),
      };
      const input = await openPalette();
      await userEvent.type(input, 'release');

      const listbox = screen.getByRole('listbox', { name: 'Results' });
      // Five sessions, plus the one workflow that matches too.
      expect(within(listbox).getAllByRole('option')).toHaveLength(6);
      const more = screen.getByRole('link', {
        name: 'Show 295 more sessions',
      });
      expect(more).toHaveAttribute('href', '/sessions?q=release');

      // The Sessions chip lists more of them, still bounded.
      await userEvent.click(screen.getByRole('button', { name: 'Sessions' }));
      expect(within(listbox).getAllByRole('option')).toHaveLength(50);
      expect(
        screen.getByRole('link', { name: 'Show 250 more sessions' }),
      ).toBeInTheDocument();
    });

    it('opens the Sessions list without the query when the palette matched more forgivingly than the list does', async () => {
      mockSessions = {
        ...mockSessions,
        rows: Array.from({ length: 7 }, (_, i) =>
          session(`s-${i}`, `Swarm Operator rollout ${i}`),
        ),
      };
      const input = await openPalette();
      await userEvent.type(input, 'swarm-operator');

      // The list searches for "swarm-operator" as typed and would find
      // none of the seven.
      expect(
        screen.getByRole('link', { name: 'Show 2 more sessions' }),
      ).toHaveAttribute('href', '/sessions');
    });

    it('links an agent overflow to Customize → Agents with the query', async () => {
      mockAgents = {
        ...mockAgents,
        rows: Array.from(
          { length: 300 },
          (_, i) =>
            ({
              ...agent,
              id: `gazelle/kagent/agent-${i}`,
              technicalName: `agent-${i}`,
              name: `Ops agent ${i}`,
            }) as AgentRow,
        ),
      };
      const input = await openPalette();
      await userEvent.type(input, 'ops');

      expect(
        screen.getByRole('link', { name: 'Show 295 more agents' }),
      ).toHaveAttribute('href', '/customize/agents?q=ops');
    });
  });

  describe('while kinds are read (T11)', () => {
    const chipGroup = () =>
      screen.getByRole('group', { name: 'Filter results' });
    const chipStates = () =>
      within(chipGroup())
        .getAllByRole('button')
        .map(
          chip =>
            `${chip.textContent}${chip.hasAttribute('disabled') ? ' (disabled)' : ''}`,
        );

    it('holds every chip in place, disabling what is not read yet, and drops the empty kinds once all is read', async () => {
      mockSessions = { rows: [], isLoading: true, isLoadingMore: false };
      mockCatalog = { skills: [], isLoading: false };
      await openPalette();

      // Sessions are still read and skills came back empty: both keep their
      // place, disabled, so no chip moves when sessions land.
      expect(chipStates()).toEqual([
        'All',
        'Sessions (disabled)',
        'Agents',
        'Skills (disabled)',
        'Connectors',
        'Models',
        'Workflows',
      ]);

      act(() => {
        mockSessions = {
          rows: [session('s-sso', 'Which customers asked about SSO?')],
          isLoading: false,
          isLoadingMore: false,
        };
        mockSessionsListeners.forEach(listener => listener());
      });

      // Everything is read: the empty kind is gone, the rest unmoved.
      expect(chipStates()).toEqual([
        'All',
        'Sessions',
        'Agents',
        'Connectors',
        'Models',
        'Workflows',
      ]);
    });

    it('leaves out a disabled chip when tabbing', async () => {
      mockSessions = { rows: [], isLoading: true, isLoadingMore: false };
      const input = await openPalette();
      expect(input).toHaveFocus();

      await userEvent.tab();
      expect(screen.getByRole('button', { name: 'All' })).toHaveFocus();
      await userEvent.tab();
      expect(screen.getByRole('button', { name: 'Agents' })).toHaveFocus();
    });
  });

  describe('forgiving search (T15, U17)', () => {
    beforeEach(() => {
      mockAgents = {
        ...mockAgents,
        rows: [
          agent,
          {
            ...agent,
            id: 'gazelle/kagent/swarm-operator',
            name: 'Swarm Operator',
            technicalName: 'swarm-operator',
            description: 'Operates the fleet',
          } as AgentRow,
        ],
      };
    });

    it.each([
      'swarmoperator',
      'Swarmoperator',
      'swarm-operator',
      'Swarm Operator',
      'swarm_operator',
      'swarm oprator',
    ])('finds the Swarm Operator agent for “%s”', async query => {
      const input = await openPalette();
      await userEvent.type(input, query);

      const listbox = screen.getByRole('listbox', { name: 'Results' });
      expect(within(listbox).getByText('Swarm Operator')).toBeVisible();
      expect(
        within(listbox).queryByText('Support Triage'),
      ).not.toBeInTheDocument();
    });
  });

  describe('placement (finding 4)', () => {
    let layout: MockedLayout | undefined;
    afterEach(() => {
      layout?.restore();
      layout = undefined;
      window.localStorage.clear();
    });

    const container = () => document.querySelector<HTMLElement>('.bui-Dialog')!;
    const header = () =>
      screen.getByRole('heading', { name: 'Search' }).parentElement!;

    async function dragBy(dx: number, dy: number) {
      const box = container();
      // Laid out at 200, 100 and 600 × 400 …
      for (const [key, value] of Object.entries({
        offsetLeft: 200,
        offsetTop: 100,
        offsetWidth: 600,
        offsetHeight: 400,
      })) {
        Object.defineProperty(box, key, { value, configurable: true });
      }
      // … but drawn 90% of that while it opens, as bui's enter animation
      // scales it: a drag measured from this would jump.
      jest.spyOn(box, 'getBoundingClientRect').mockReturnValue({
        left: 230,
        top: 120,
        width: 540,
        height: 360,
        right: 770,
        bottom: 480,
        x: 230,
        y: 120,
        toJSON: () => ({}),
      });
      fireEvent.pointerDown(header(), {
        button: 0,
        pointerId: 1,
        clientX: 300,
        clientY: 120,
      });
      fireEvent.pointerMove(header(), {
        pointerId: 1,
        clientX: 300 + dx,
        clientY: 120 + dy,
      });
      fireEvent.pointerUp(header(), { pointerId: 1 });
    }

    it('dims nothing behind it, so the page stays in view', async () => {
      // jsdom does not apply bui's layered stylesheet, so a stand-in for its
      // backdrop: the palette's own rule must win over it.
      const backdrop = document.createElement('style');
      backdrop.textContent =
        '.bui-DialogOverlay { background-color: rgb(1, 2, 3); }';
      document.head.appendChild(backdrop);
      await openPalette();
      const overlay = document.querySelector<HTMLElement>(
        '.bui-DialogOverlay[data-command-palette]',
      );
      expect(overlay).toBeInTheDocument();
      expect(window.getComputedStyle(overlay!).backgroundColor).not.toBe(
        'rgb(1, 2, 3)',
      );
      backdrop.remove();
    });

    it('moves by its header, stays in the window, and is remembered per browser', async () => {
      layout = mockDesktopLayout();
      // jsdom's window is 1024 × 768. Its size is left alone: react-aria
      // reads a change of it as an on-screen keyboard and holds later
      // dialogs hidden.
      const input = await openPalette();
      expect(container().style.position).toBe('');

      await dragBy(-120, 40);
      expect(container().style.left).toBe('80px');
      expect(container().style.top).toBe('140px');
      // Focus never left the field.
      expect(input).toHaveFocus();
      expect(
        JSON.parse(
          window.localStorage.getItem('gs-agent-platform-search-position')!,
        ),
      ).toEqual({ x: 80, y: 140 });

      // Past the edge: held 8px inside the window.
      await dragBy(-1000, -1000);
      expect(container().style.left).toBe('8px');
      expect(container().style.top).toBe('8px');

      // Escape still closes it; it opens where it was left.
      await userEvent.keyboard('{Escape}');
      await waitFor(() =>
        expect(screen.queryByRole('combobox')).not.toBeInTheDocument(),
      );
      await userEvent.click(
        screen.getByRole('button', { name: 'Open search' }),
      );
      await screen.findByRole('combobox');
      expect(container().style.left).toBe('8px');
    });

    it('goes back to the middle on a double-click of its header', async () => {
      layout = mockDesktopLayout();
      await openPalette();
      await dragBy(50, 50);
      expect(container().style.position).toBe('fixed');

      fireEvent.doubleClick(header());
      expect(container().style.position).toBe('');
      expect(
        window.localStorage.getItem('gs-agent-platform-search-position'),
      ).toBeNull();
    });

    it('does not drag from the close button', async () => {
      layout = mockDesktopLayout();
      await openPalette();
      const close = within(header()).getByRole('button', { name: 'Close' });
      fireEvent.pointerDown(close, { button: 0, clientX: 0, clientY: 0 });
      fireEvent.pointerMove(header(), { clientX: 100, clientY: 100 });
      fireEvent.pointerUp(header());
      expect(container().style.position).toBe('');
    });

    it('stays the whole screen on a phone, with nothing to drag', async () => {
      layout = mockPhoneLayout();
      window.localStorage.setItem(
        'gs-agent-platform-search-position',
        JSON.stringify({ x: 40, y: 40 }),
      );
      await openPalette();
      expect(container().style.position).toBe('');
      expect(screen.getByText('Search')).not.toHaveAttribute('title');

      fireEvent.pointerDown(header(), { button: 0, clientX: 0, clientY: 0 });
      fireEvent.pointerMove(header(), { clientX: 100, clientY: 100 });
      fireEvent.pointerUp(header());
      expect(container().style.position).toBe('');
    });
  });

  it('says honestly when nothing matches, staying in the shell', async () => {
    const input = await openPalette();
    await userEvent.type(input, 'zzz-no-such-thing');

    expect(
      screen.getByText('No results for “zzz-no-such-thing”.'),
    ).toBeVisible();
    // No way out to the classic portal search (M18).
    expect(
      screen.queryByRole('listbox', { name: 'Results' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/whole portal/)).not.toBeInTheDocument();
  });
});

describe('CommandPalette by touch (T22 B20, P7)', () => {
  let layout: MockedLayout;
  afterEach(() => layout.restore());

  it('starts a session from a button on the agent’s row, without opening the agent', async () => {
    layout = mockPhoneLayout();
    const input = await openPalette();
    await userEvent.type(input, 'sso');

    await userEvent.click(
      screen.getByRole('button', {
        name: 'Start a session with Support Triage',
      }),
    );

    expect(
      await screen.findByText('Composer for Support Triage'),
    ).toBeVisible();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('offers the button on agents only', async () => {
    layout = mockPhoneLayout();
    const input = await openPalette();
    await userEvent.type(input, 'sso');

    expect(
      screen.getAllByRole('button', { name: /^Start a session with/ }),
    ).toHaveLength(1);
  });

  it('shows no key hints on touch input, only what is still loading', async () => {
    layout = mockPhoneLayout();
    mockSessions = { ...mockSessions, isLoadingMore: true };
    await openPalette();

    expect(screen.queryByText(/move$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/open$/)).not.toBeInTheDocument();
    expect(
      screen.getByText('Some results are still loading…'),
    ).toBeInTheDocument();
  });

  it('keeps ⌘↵ and its hint on a desktop, with no button', async () => {
    layout = mockDesktopLayout();
    const input = await openPalette();
    await userEvent.type(input, 'sso');
    fireEvent.keyDown(input, { key: 'ArrowDown' }); // onto the agent

    expect(screen.getByText(/start a session with this agent/)).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /^Start a session with/ }),
    ).not.toBeInTheDocument();
  });
});
