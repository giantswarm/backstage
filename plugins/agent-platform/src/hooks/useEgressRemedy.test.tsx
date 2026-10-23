import { renderHook } from '@testing-library/react';

import { useEgressRemedy } from './useEgressRemedy';

const mockPresence = jest.fn();
const mockInfo = jest.fn();
jest.mock('./useAgentManager', () => ({
  useAgentManagerAvailability: () => ({
    presenceOf: () => mockPresence(),
    isLoading: false,
  }),
  useAgentManagerInfo: (installation: string | undefined) =>
    installation ? mockInfo() : { info: undefined, isLoading: false },
}));

const mockAgentRead = jest.fn();
jest.mock('./useAgentManagerAgent', () => ({
  useAgentManagerAgent: () => mockAgentRead(),
}));

const mockChoices = jest.fn();
jest.mock('./useHarnessChoices', () => ({
  useHarnessChoices: (installation: string | undefined) =>
    installation
      ? mockChoices()
      : { choices: [], platformHarness: 'kagent', isLoading: false },
}));

const mockAccess = jest.fn();
jest.mock('@giantswarm/backstage-plugin-kubernetes-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-kubernetes-react'),
  useSelfSubjectAccessReview: (
    _cluster: string,
    _attributes: unknown,
    options: { enabled: boolean },
  ) => (options.enabled ? mockAccess() : { allowed: false, isLoading: false }),
}));

jest.mock('@backstage/frontend-plugin-api', () => ({
  ...jest.requireActual('@backstage/frontend-plugin-api'),
  useRouteRef:
    () =>
    (params?: { installation: string; namespace: string; name: string }) =>
      params
        ? `/customize/agents/${params.installation}/${params.namespace}/${params.name}`
        : '/customize/toolchains',
}));
jest.mock('./useNewSessionHref', () => ({
  useNewSessionHref: () => (agent: { id: string }) =>
    `/?agent=${encodeURIComponent(agent.id)}`,
}));

const editableAgent = {
  name: 'otter',
  namespace: 'team',
  exists: true,
  ready: true,
  managed: 'helmrelease',
  helmRelease: { name: 'otter', namespace: 'team' },
};

const options = {
  installation: 'lab',
  agent: { namespace: 'team', name: 'otter' },
  enabled: true,
};

beforeEach(() => {
  mockPresence.mockReturnValue('available');
  mockInfo.mockReturnValue({
    info: { identity: 'caller', capabilities: {} },
    isLoading: false,
  });
  mockAgentRead.mockReturnValue({ agent: editableAgent, isLoading: false });
  mockChoices.mockReturnValue({
    choices: [{ name: 'kagent', runtime: 'kagent' }],
    platformHarness: 'kagent',
    isLoading: false,
  });
  mockAccess.mockReturnValue({ allowed: true, isLoading: false });
});

describe('useEgressRemedy', () => {
  it('reads nothing until enabled', () => {
    const { result } = renderHook(() =>
      useEgressRemedy({ ...options, enabled: false }),
    );
    expect(result.current).toEqual({ kind: 'pending' });
  });

  it('takes the runtime from the fleet’s row, with the toolchain links', () => {
    mockInfo.mockReturnValue({
      info: { identity: 'caller', capabilities: { toolchains: true } },
      isLoading: false,
    });
    const { result } = renderHook(() =>
      useEgressRemedy({
        ...options,
        harness: { name: 'claude', title: 'Claude Code', runtime: 'claude' },
      }),
    );
    expect(result.current).toEqual({
      kind: 'toolchains',
      runtime: 'Claude Code',
      toolchainsHref: '/customize/toolchains',
      newSessionHref: '/?agent=lab%2Fteam%2Fotter',
    });
  });

  it('looks the runtime up among the namespace’s Harnesses where the row has none', () => {
    mockChoices.mockReturnValue({
      choices: [{ name: 'codex', runtime: 'codex' }],
      platformHarness: 'kagent',
      isLoading: false,
    });
    const { result } = renderHook(() =>
      useEgressRemedy({ ...options, harness: { name: 'codex' } }),
    );
    expect(result.current).toEqual({ kind: 'platform', runtime: 'Codex' });
  });

  it('gives the coding remedy where agent-manager cannot read the agent', () => {
    mockAgentRead.mockReturnValue({
      agent: undefined,
      isLoading: false,
      failure: { kind: 'refused', message: 'forbidden' },
    });
    const { result } = renderHook(() =>
      useEgressRemedy({
        ...options,
        harness: { name: 'claude', runtime: 'claude' },
      }),
    );
    expect(result.current).toEqual({
      kind: 'platform',
      runtime: 'Claude Code',
    });
  });

  it('shows no remedy while the Harnesses are read', () => {
    mockChoices.mockReturnValue({
      choices: [],
      platformHarness: 'kagent',
      isLoading: true,
    });
    const { result } = renderHook(() =>
      useEgressRemedy({ ...options, harness: { name: 'codex' } }),
    );
    expect(result.current).toEqual({ kind: 'pending' });
  });

  it('promises nothing for a Harness whose runtime cannot be read', () => {
    mockChoices.mockReturnValue({
      choices: [],
      platformHarness: 'kagent',
      isLoading: false,
    });
    const { result } = renderHook(() =>
      useEgressRemedy({ ...options, harness: { name: 'codex' } }),
    );
    expect(result.current).toEqual({ kind: 'neutral' });
  });

  it('links the edit page for an editor of a kagent agent', () => {
    const { result } = renderHook(() =>
      useEgressRemedy({ ...options, harness: { runtime: 'kagent' } }),
    );
    expect(result.current).toEqual({
      kind: 'edit',
      editHref: '/customize/agents/lab/team/otter',
    });
  });

  it('asks an editor for a person the API server refuses', () => {
    mockAccess.mockReturnValue({ allowed: false, isLoading: false });
    const { result } = renderHook(() =>
      useEgressRemedy({ ...options, harness: { runtime: 'kagent' } }),
    );
    expect(result.current.kind).toBe('ask-editor');
  });

  it('names the platform Harness for an agent that names none', () => {
    mockAgentRead.mockReturnValue({
      agent: { ...editableAgent, harness: undefined },
      isLoading: false,
    });
    const { result } = renderHook(() => useEgressRemedy(options));
    expect(result.current.kind).toBe('edit');
  });

  it('promises nothing where agent-manager is not on the installation', () => {
    mockPresence.mockReturnValue('absent');
    const { result } = renderHook(() =>
      useEgressRemedy({ ...options, harness: { runtime: 'kagent' } }),
    );
    expect(result.current).toEqual({ kind: 'neutral' });
  });
});
