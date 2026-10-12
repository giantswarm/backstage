import type { ReactNode } from 'react';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  agentsRouteRef,
  modelsRouteRef,
  musterServersExternalRouteRef,
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
} from '@giantswarm/backstage-plugin-ui-react';

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
        '/agent-platform/sessions': sessionsRouteRef,
        '/agent-platform/agents': agentsRouteRef,
        '/agent-platform/skills': skillsRouteRef,
        '/agent-platform/connectors': musterServersExternalRouteRef,
        '/agent-platform/models': modelsRouteRef,
        '/agent-platform/workflows/:name': musterWorkflowDetailExternalRouteRef,
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
    rows: [{ page: 'confluence', installations: ['gazelle'] }],
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
      '/agent-platform/agents/gazelle/kagent/support-triage',
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('listbox', { name: 'Results' }),
      ).not.toBeInTheDocument(),
    );
  });

  describe('scrolling', () => {
    // jsdom does not lay out or scroll; record which elements were asked to.
    const scrolled: Element[] = [];
    const scrollIntoView = jest.fn(function record(this: Element) {
      scrolled.push(this);
    });

    beforeEach(() => {
      scrolled.length = 0;
      scrollIntoView.mockClear();
      Element.prototype.scrollIntoView = scrollIntoView;
    });

    afterEach(() => {
      delete (Element.prototype as Partial<Element>).scrollIntoView;
    });

    const activeOption = (input: HTMLElement) =>
      document.getElementById(input.getAttribute('aria-activedescendant')!)!;

    it('keeps the row the arrow keys move to in view', async () => {
      const input = await openPalette();
      await userEvent.type(input, 'sso');
      scrolled.length = 0;
      scrollIntoView.mockClear();

      // Onto the agent, the first row of its group: the heading comes along.
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      expect(activeOption(input)).toHaveTextContent('Support Triage');
      expect(scrolled).toEqual([
        within(screen.getByRole('listbox', { name: 'Results' }))
          .getByText('Agents')
          .closest('div'),
        activeOption(input),
      ]);
      // "nearest": the list moves only when the row is not fully in view.
      expect(scrollIntoView.mock.calls).toEqual([
        [{ block: 'nearest' }],
        [{ block: 'nearest' }],
      ]);

      scrolled.length = 0;
      fireEvent.keyDown(input, { key: 'ArrowUp' });
      expect(activeOption(input)).toHaveTextContent(
        'Which customers asked about SSO this month?',
      );
      expect(scrolled).toContain(activeOption(input));
    });

    it('does not scroll when the pointer selects a row', async () => {
      const input = await openPalette();
      await userEvent.type(input, 'sso');
      scrollIntoView.mockClear();

      fireEvent.mouseMove(screen.getByText('Support Triage'));
      expect(activeOption(input)).toHaveTextContent('Support Triage');
      expect(scrollIntoView).not.toHaveBeenCalled();
    });

    it('scrolls the list back to the top on a new query', async () => {
      const input = await openPalette();
      const listbox = screen.getByRole('listbox', { name: 'Results' });
      listbox.scrollTop = 120;

      await userEvent.type(input, 's');
      expect(listbox.scrollTop).toBe(0);
    });
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

  it('finds a model and opens its page', async () => {
    const input = await openPalette();
    await userEvent.type(input, 'default-model');

    const listbox = screen.getByRole('listbox', { name: 'Results' });
    expect(within(listbox).getByText('Models')).toBeVisible();
    await userEvent.click(within(listbox).getByText('Default model'));
    expect(mockNavigate).toHaveBeenCalledWith(
      '/agent-platform/models/gazelle/kagent/default-model',
    );
  });

  it('finds a workflow and opens its page on its installation', async () => {
    const input = await openPalette();
    await userEvent.type(input, 'release-readiness');

    const listbox = screen.getByRole('listbox', { name: 'Results' });
    expect(within(listbox).getByText('Workflows')).toBeVisible();
    await userEvent.click(within(listbox).getByText('release-readiness'));
    expect(mockNavigate).toHaveBeenCalledWith(
      '/agent-platform/workflows/release-readiness?installation=gazelle',
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
      expect(more).toHaveAttribute(
        'href',
        '/agent-platform/sessions?q=release',
      );

      // The Sessions chip lists more of them, still bounded.
      await userEvent.click(screen.getByRole('button', { name: 'Sessions' }));
      expect(within(listbox).getAllByRole('option')).toHaveLength(50);
      expect(
        screen.getByRole('link', { name: 'Show 250 more sessions' }),
      ).toBeInTheDocument();
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
