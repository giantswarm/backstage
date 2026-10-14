import { act, renderHook } from '@testing-library/react';
import { MESSAGE_TEXT_MAX_LENGTH } from '@giantswarm/backstage-plugin-agent-platform-common';
import { useMetaAgentHandoff } from './useMetaAgentHandoff';

const AGENT = {
  installation: 'gazelle',
  namespace: 'kagent',
  technicalName: 'skill-creator',
  name: 'Skill Creator',
  readiness: 'ready',
};

jest.mock('./useMetaAgent', () => ({
  useMetaAgent: () => AGENT,
}));

const mockCreateSession = jest.fn();
jest.mock('./useCreateSession', () => ({
  useCreateSession: () => ({
    createSession: mockCreateSession,
    isCreating: false,
    error: null,
  }),
}));

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

jest.mock('@backstage/frontend-plugin-api', () => ({
  ...jest.requireActual('@backstage/frontend-plugin-api'),
  useRouteRef:
    () =>
    ({
      installation,
      sessionId,
    }: {
      installation: string;
      sessionId: string;
    }) =>
      `/agent-platform/sessions/${installation}/${sessionId}`,
}));

beforeEach(() => {
  mockCreateSession.mockReset();
  mockCreateSession.mockResolvedValue('session-1');
  mockNavigate.mockReset();
});

describe('useMetaAgentHandoff', () => {
  it('creates the session and opens it with the prompt', async () => {
    const { result } = renderHook(() =>
      useMetaAgentHandoff('skillCreation', 'skillCreationAssist'),
    );

    await act(async () => {
      await result.current.start('Write me a skill.');
    });

    expect(mockCreateSession).toHaveBeenCalledWith({
      agent: AGENT,
      prompt: 'Write me a skill.',
    });
    expect(mockNavigate).toHaveBeenCalledWith(
      '/agent-platform/sessions/gazelle/session-1',
      expect.anything(),
    );
  });

  it('refuses a prompt over the message cap before creating anything (R2-7)', async () => {
    const { result } = renderHook(() =>
      useMetaAgentHandoff('skillCreation', 'skillCreationAssist'),
    );

    await act(async () => {
      await result.current.start('x'.repeat(MESSAGE_TEXT_MAX_LENGTH + 1));
    });

    expect(mockCreateSession).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(result.current.error?.message).toBe(
      'What you typed is too large to carry into a session: it needs 32,001 characters, and a message may hold 32,000.',
    );

    // A prompt that fits clears the refusal.
    await act(async () => {
      await result.current.start('x'.repeat(MESSAGE_TEXT_MAX_LENGTH));
    });
    expect(result.current.error).toBeNull();
    expect(mockCreateSession).toHaveBeenCalledTimes(1);
  });
});
