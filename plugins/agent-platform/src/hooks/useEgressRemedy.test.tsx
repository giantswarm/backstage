import { renderHook } from '@testing-library/react';

import { useEgressRemedy } from './useEgressRemedy';

const mockAvailability = jest.fn();
const mockInfo = jest.fn();
const mockInfoAsked = jest.fn();
jest.mock('./useAgentManager', () => ({
  useAgentManagerAvailability: () => mockAvailability(),
  useAgentManagerInfo: (installation: string | undefined) => {
    mockInfoAsked(installation);
    return installation
      ? mockInfo()
      : { info: undefined, isLoading: false, error: null };
  },
}));

const mockAgentRead = jest.fn();
jest.mock('./useAgentManagerAgent', () => ({
  useAgentManagerAgent: () => mockAgentRead(),
}));

const mockChoices = jest.fn();
const mockHarnessesAsked = jest.fn();
jest.mock('./useHarnessChoices', () => ({
  useHarnessChoices: (installation: string | undefined) => {
    mockHarnessesAsked(installation);
    return installation
      ? mockChoices()
      : { choices: [], platformHarness: 'kagent', isLoading: false };
  },
}));

const mockAccess = jest.fn();
const mockAccessAsked = jest.fn();
jest.mock('@giantswarm/backstage-plugin-kubernetes-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-kubernetes-react'),
  useSelfSubjectAccessReview: (
    _cluster: string,
    _attributes: unknown,
    options: { enabled: boolean },
  ) => {
    if (options.enabled) {
      mockAccessAsked();
      return mockAccess();
    }
    return { allowed: false, isLoading: false };
  },
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
const kagentRow = {
  id: 'lab/team/otter',
  harness: 'kagent',
  harnessRuntime: 'kagent' as const,
};
const claudeRow = {
  id: 'lab/team/otter',
  harness: 'claude',
  harnessTitle: 'Claude Code',
  harnessRuntime: 'claude' as const,
};

function info(capabilities: Record<string, boolean> = {}, identity = 'caller') {
  return { info: { identity, capabilities }, isLoading: false, error: null };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAvailability.mockReturnValue({
    presenceOf: () => 'available',
    isLoading: false,
  });
  mockInfo.mockReturnValue(info());
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
    expect(mockInfoAsked).not.toHaveBeenCalledWith('lab');
  });

  it('shows no remedy while muster’s server list is read, for a coding agent too', () => {
    mockAvailability.mockReturnValue({
      presenceOf: () => 'unknown',
      isLoading: true,
    });
    const { result } = renderHook(() =>
      useEgressRemedy({ ...options, row: claudeRow }),
    );
    expect(result.current).toEqual({ kind: 'pending' });
  });

  it('takes the runtime from the fleet’s row, with the toolchain links', () => {
    mockInfo.mockReturnValue(info({ toolchains: true }));
    const { result } = renderHook(() =>
      useEgressRemedy({ ...options, row: claudeRow }),
    );
    expect(result.current).toEqual({
      kind: 'toolchains',
      runtime: 'Claude Code',
      toolchainsHref: '/customize/toolchains',
      newSessionHref: '/?agent=lab%2Fteam%2Fotter',
    });
    expect(mockHarnessesAsked).not.toHaveBeenCalledWith('lab');
  });

  it('shows no remedy for a coding agent while get_info is read', () => {
    mockInfo.mockReturnValue({ info: undefined, isLoading: true, error: null });
    const { result } = renderHook(() =>
      useEgressRemedy({ ...options, row: claudeRow }),
    );
    expect(result.current).toEqual({ kind: 'pending' });
  });

  it('promises nothing where get_info failed', () => {
    mockInfo.mockReturnValue({
      info: undefined,
      isLoading: false,
      error: new Error('boom'),
    });
    const coding = renderHook(() =>
      useEgressRemedy({ ...options, row: claudeRow }),
    );
    expect(coding.result.current).toEqual({ kind: 'neutral' });
    mockAgentRead.mockReturnValue({
      agent: { ...editableAgent, managed: 'gitops' },
      isLoading: false,
    });
    const gitops = renderHook(() =>
      useEgressRemedy({ ...options, row: kagentRow }),
    );
    expect(gitops.result.current).toEqual({ kind: 'neutral' });
  });

  it('looks the runtime up among the namespace’s Harnesses where the row has none', () => {
    mockChoices.mockReturnValue({
      choices: [{ name: 'codex', runtime: 'codex' }],
      platformHarness: 'kagent',
      isLoading: false,
    });
    const { result } = renderHook(() =>
      useEgressRemedy({
        ...options,
        row: { id: 'lab/team/otter', harness: 'codex' },
      }),
    );
    expect(result.current).toEqual({ kind: 'platform', runtime: 'Codex' });
  });

  it('never reads an inline Harness as the platform’s', () => {
    const { result } = renderHook(() =>
      useEgressRemedy({ ...options, row: { id: 'lab/team/otter' } }),
    );
    expect(result.current).toEqual({ kind: 'neutral' });
  });

  it('gives the coding remedy where agent-manager cannot read the agent', () => {
    mockAgentRead.mockReturnValue({
      agent: undefined,
      isLoading: false,
      failure: { kind: 'refused', message: 'forbidden' },
    });
    const { result } = renderHook(() =>
      useEgressRemedy({ ...options, row: claudeRow }),
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
      useEgressRemedy({
        ...options,
        row: { id: 'lab/team/otter', harness: 'codex' },
      }),
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
      useEgressRemedy({
        ...options,
        row: { id: 'lab/team/otter', harness: 'codex' },
      }),
    );
    expect(result.current).toEqual({ kind: 'neutral' });
  });

  it('links the edit page for an editor of a kagent agent', () => {
    const { result } = renderHook(() =>
      useEgressRemedy({ ...options, row: kagentRow }),
    );
    expect(result.current).toEqual({
      kind: 'edit',
      editHref: '/customize/agents/lab/team/otter',
    });
  });

  it('asks an editor for a person the API server refuses', () => {
    mockAccess.mockReturnValue({ allowed: false, isLoading: false });
    const { result } = renderHook(() =>
      useEgressRemedy({ ...options, row: kagentRow }),
    );
    expect(result.current.kind).toBe('ask-editor');
  });

  it('asks nothing until get_info says who writes, and nothing where agent-manager does', () => {
    mockInfo.mockReturnValue({ info: undefined, isLoading: true, error: null });
    const loading = renderHook(() =>
      useEgressRemedy({ ...options, row: kagentRow }),
    );
    expect(loading.result.current).toEqual({ kind: 'pending' });
    expect(mockAccessAsked).not.toHaveBeenCalled();

    mockInfo.mockReturnValue(info({}, 'serviceAccount'));
    const serviceAccount = renderHook(() =>
      useEgressRemedy({ ...options, row: kagentRow }),
    );
    expect(serviceAccount.result.current.kind).toBe('edit');
    expect(mockAccessAsked).not.toHaveBeenCalled();
  });

  it('names the platform Harness for an agent with no row that names none', () => {
    mockAgentRead.mockReturnValue({
      agent: { ...editableAgent, harness: undefined },
      isLoading: false,
    });
    const { result } = renderHook(() => useEgressRemedy(options));
    expect(result.current.kind).toBe('edit');
  });

  it('promises nothing, and reads nothing more, where agent-manager is not on the installation', () => {
    mockAvailability.mockReturnValue({
      presenceOf: () => 'absent',
      isLoading: false,
    });
    const { result } = renderHook(() =>
      useEgressRemedy({
        ...options,
        row: { id: 'lab/team/otter', harness: 'codex' },
      }),
    );
    expect(result.current).toEqual({ kind: 'neutral' });
    expect(mockInfoAsked).not.toHaveBeenCalledWith('lab');
    expect(mockHarnessesAsked).not.toHaveBeenCalledWith('lab');
  });
});
