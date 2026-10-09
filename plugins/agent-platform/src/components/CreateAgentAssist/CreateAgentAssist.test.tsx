import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderInTestApp } from '@backstage/frontend-test-utils';

import { sessionsRouteRef } from '../../routes';
import type { AgentRow } from '../AgentsDataProvider';
import { NewAgentFormProvider, useNewAgentForm } from '../NewAgentFormProvider';
import type { SessionDetailView } from '../../hooks/useSessionDetail';
import { CreateAgentAssist } from './CreateAgentAssist';

let configuredRoles: Record<string, string | undefined> = {};
jest.mock('@giantswarm/backstage-plugin-gs-react', () => ({
  useSignedInConfig: () => ({
    config: {
      getOptionalString: (key: string) =>
        configuredRoles[key.replace('agentPlatform.metaAgents.', '')],
    },
    isLoading: false,
  }),
}));

let mockRows: AgentRow[] = [];
jest.mock('../AgentsDataProvider', () => ({
  AgentsDataProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  useAgents: () => ({ rows: mockRows, isLoading: false }),
}));

jest.mock('../../hooks/useAgentAvatarUrl', () => ({
  useAgentAvatarUrl: () => () => undefined,
}));

const createSession = jest.fn();
let capturedEntryPoint: string | undefined;
jest.mock('../../hooks/useCreateSession', () => ({
  useCreateSession: (entryPoint: string) => {
    capturedEntryPoint = entryPoint;
    return {
      createSession,
      isCreating: false,
      error: null,
      reset: jest.fn(),
    };
  },
}));

let mockView: SessionDetailView;
jest.mock('../../hooks/useSessionDetail', () => ({
  useSessionDetail: () => mockView,
}));

const sendMessage = jest.fn().mockResolvedValue(undefined);
jest.mock('../../hooks/useSendMessage', () => ({
  useSendMessage: () => ({
    sendMessage,
    isSending: false,
    pending: null,
    stream: null,
    isStreamLost: false,
    failed: null,
    error: null,
    reset: jest.fn(),
  }),
}));

jest.mock('../../hooks/useAnswerConfirmation', () => ({
  useAnswerConfirmation: () => ({
    answer: jest.fn(),
    isAnswering: false,
    pending: null,
    stream: null,
    isStreamLost: false,
    failed: null,
    error: null,
    reset: jest.fn(),
  }),
}));

jest.mock('../../hooks/useKagentCapabilities', () => ({
  useKagentCapabilities: () => ({ isUserScoped: true }),
}));

// The timeline's own rendering is covered by its tests; here it only needs to
// show that the conversation's items reach it.
jest.mock('../SessionTimeline', () => ({
  SessionTimeline: ({
    timeline,
  }: {
    timeline: { items: { id: string; text?: string }[] };
  }) => (
    <div data-testid="timeline">
      {timeline.items.map(item => (
        <div key={item.id}>{item.text ?? ''}</div>
      ))}
    </div>
  ),
}));

function agent(technicalName: string, name = technicalName): AgentRow {
  return {
    id: `gazelle/kagent/${technicalName}`,
    installation: 'gazelle',
    namespace: 'kagent',
    name,
    technicalName,
    description: '',
    skillCount: 0,
    readiness: 'ready',
  } as AgentRow;
}

const DRAFT = 'You are a support triage agent.\nNever close tickets yourself.';

const emptyView: SessionDetailView = {
  detail: undefined,
  timeline: {
    items: [],
    tokens: { total: 0, prompt: 0, completion: 0 },
    skippedMessages: 0,
  },
  isAgentWorking: false,
  taskCount: 0,
  hasConversation: false,
  isLoading: false,
  isNotFound: false,
};

/** A finished first turn whose reply carries a fenced draft. */
function viewWithDraft(): SessionDetailView {
  return {
    ...emptyView,
    detail: {} as SessionDetailView['detail'],
    timeline: {
      items: [
        {
          kind: 'user-message',
          id: 'u1',
          messageId: 'm1',
          taskIndex: 0,
          text: 'Draft the instructions please.',
        },
        {
          kind: 'agent-message',
          id: 'a1',
          messageId: 'm2',
          taskIndex: 0,
          text: `Here is a draft:\n\`\`\`\n${DRAFT}\n\`\`\`\nAdjust as you like.`,
        },
      ],
      tokens: { total: 0, prompt: 0, completion: 0 },
      skippedMessages: 0,
    },
    state: {
      key: 'completed',
      raw: 'completed',
      label: 'completed',
      isActive: false,
    } as SessionDetailView['state'],
    taskCount: 1,
    hasConversation: true,
  };
}

/** Shows what the form's System prompt field holds, for the accept tests. */
function SystemPromptProbe() {
  const { state, setSystemMessage } = useNewAgentForm();
  return (
    <>
      <div data-testid="system-prompt">{state.systemMessage}</div>
      <button type="button" onClick={() => setSystemMessage('hand-written')}>
        seed prompt
      </button>
    </>
  );
}

function renderAssist() {
  return renderInTestApp(
    <NewAgentFormProvider>
      <CreateAgentAssist />
      <SystemPromptProbe />
    </NewAgentFormProvider>,
    {
      mountedRoutes: {
        '/agent-platform/sessions': sessionsRouteRef,
      },
    },
  );
}

beforeEach(() => {
  configuredRoles = {};
  mockRows = [];
  mockView = emptyView;
  capturedEntryPoint = undefined;
  createSession.mockReset();
  createSession.mockResolvedValue('session-1');
  sendMessage.mockClear();
});

describe('CreateAgentAssist', () => {
  it('renders nothing while the agentManagement role is unconfigured', async () => {
    mockRows = [agent('swarm-operator', 'Swarm Operator')];
    await renderAssist();

    expect(screen.queryByRole('button', { name: /help/i })).toBeNull();
  });

  it('renders nothing when the configured name matches no agent', async () => {
    configuredRoles = { agentManagement: 'swarm-operator' };
    mockRows = [agent('some-other-agent')];
    await renderAssist();

    expect(screen.queryByRole('button', { name: /help/i })).toBeNull();
  });

  it('offers the assist when the role resolves, and opens the panel', async () => {
    configuredRoles = { agentManagement: 'swarm-operator' };
    mockRows = [agent('swarm-operator', 'Swarm Operator')];
    await renderAssist();

    await userEvent.click(
      screen.getByRole('button', { name: 'Let Swarm Operator help' }),
    );

    const panel = screen.getByRole('complementary', {
      name: 'Swarm Operator assist',
    });
    expect(
      within(panel).getByText(/Nothing changes in the form/),
    ).toBeInTheDocument();
    // The opening prompt is prefilled and editable, with the fenced-block
    // instruction the accept mechanism depends on.
    const prompt = within(panel).getByRole('textbox', {
      name: 'Prompt',
    }) as HTMLTextAreaElement;
    expect(prompt.value).toContain('fenced code block');
  });

  it('starts the session with the configured agent, tracked as createAgentAssist, and dispatches the prompt', async () => {
    configuredRoles = { agentManagement: 'swarm-operator' };
    mockRows = [agent('swarm-operator', 'Swarm Operator')];
    mockView = viewWithDraft();
    await renderAssist();

    await userEvent.click(
      screen.getByRole('button', { name: 'Let Swarm Operator help' }),
    );
    expect(capturedEntryPoint).toBe('createAgentAssist');

    const panel = screen.getByRole('complementary', {
      name: 'Swarm Operator assist',
    });
    await userEvent.click(within(panel).getByRole('button', { name: 'Start' }));

    await waitFor(() => {
      expect(createSession).toHaveBeenCalledTimes(1);
    });
    const { agent: usedAgent, prompt } = createSession.mock.calls[0][0];
    expect(usedAgent.technicalName).toBe('swarm-operator');
    expect(prompt).toContain('fenced code block');

    // The conversation mounts in the panel and sends the first message itself —
    // the create said nothing to the agent.
    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith(prompt);
    });
    expect(screen.getByTestId('timeline')).toHaveTextContent(
      'Here is a draft:',
    );
  });

  it('copies a fenced suggestion into the system prompt, with undo', async () => {
    configuredRoles = { agentManagement: 'swarm-operator' };
    mockRows = [agent('swarm-operator', 'Swarm Operator')];
    mockView = viewWithDraft();
    await renderAssist();

    // Something already in the field, so Undo has something to restore.
    await userEvent.click(screen.getByRole('button', { name: 'seed prompt' }));

    await userEvent.click(
      screen.getByRole('button', { name: 'Let Swarm Operator help' }),
    );
    const panel = screen.getByRole('complementary', {
      name: 'Swarm Operator assist',
    });
    await userEvent.click(within(panel).getByRole('button', { name: 'Start' }));

    const use = await within(panel).findByRole('button', {
      name: 'Use as system prompt',
    });
    await userEvent.click(use);

    expect(screen.getByTestId('system-prompt')).toHaveTextContent(
      'You are a support triage agent.',
    );
    expect(
      within(panel).getByText('Added to the system prompt.'),
    ).toBeInTheDocument();

    await userEvent.click(within(panel).getByRole('button', { name: 'Undo' }));
    expect(screen.getByTestId('system-prompt')).toHaveTextContent(
      'hand-written',
    );
  });
});
