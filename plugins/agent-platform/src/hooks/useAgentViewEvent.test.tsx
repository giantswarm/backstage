import { renderHook } from '@testing-library/react';
import { Agent } from '@giantswarm/backstage-plugin-kubernetes-react';

import type { AgentToolset } from './useAgentToolset';
import { useAgentViewEvent } from './useAgentViewEvent';
import type { ToolsetResolution } from './useToolsetResolution';

const mockUseToolsetResolution = jest.fn<
  ToolsetResolution,
  [string | undefined, string[]]
>();
jest.mock('./useToolsetResolution', () => ({
  useToolsetResolution: (
    installation: string | undefined,
    selectors: string[],
  ) => mockUseToolsetResolution(installation, selectors),
}));

type Binding = { name: string; tools?: string[] };

function makeAgent({
  skills = 0,
  bindings = [{ name: 'pr-reviewer' }],
}: { skills?: number; bindings?: Binding[] } = {}) {
  return new Agent(
    {
      apiVersion: 'api.kagent.dev/v1alpha3',
      kind: 'Agent',
      metadata: { name: 'pr-reviewer', namespace: 'kagent' },
      spec: {
        harnessRef: { name: 'kagent' },
        template: {
          // The first, named after the agent, is its gateway carrier.
          tools: bindings.map(({ name, tools }) => ({
            mcp: {
              server: { kind: 'RemoteMCPServer', name },
              ...(tools ? { tools } : {}),
            },
          })),
          skills: Array.from({ length: skills }, (_, index) => ({
            name: `skill-${index}`,
            source: {
              git: { url: 'https://github.com/example/skills', commit: 'abc' },
              path: `skill-${index}`,
            },
          })),
        },
      },
    } as never,
    'gazelle',
  );
}

const declared = (selectors: string[]): AgentToolset => ({
  declared: { state: 'declared', selectors, carrier: 'pr-reviewer' },
  isReading: false,
  isUnreadable: false,
});

function resolution(
  overrides: Partial<ToolsetResolution> = {},
): ToolsetResolution {
  return {
    tools: [],
    unmatched: [],
    truncated: false,
    isLoading: false,
    status: 'resolved',
    ...overrides,
  };
}

function resolvedTools(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    name: `tool_${index}`,
  })) as ToolsetResolution['tools'];
}

function render(agent: Agent | undefined, toolset: AgentToolset | undefined) {
  return renderHook(() => useAgentViewEvent(agent, toolset)).result.current;
}

describe('useAgentViewEvent', () => {
  beforeEach(() => {
    mockUseToolsetResolution.mockReset();
    mockUseToolsetResolution.mockReturnValue(resolution({ status: 'idle' }));
  });

  it('counts the skills and the tools the toolset resolves to, in buckets', () => {
    mockUseToolsetResolution.mockReturnValue(
      resolution({ tools: resolvedTools(12) }),
    );

    const event = render(
      makeAgent({ skills: 3 }),
      declared(['server:github', 'preset:read-only']),
    );

    expect(mockUseToolsetResolution).toHaveBeenCalledWith('gazelle', [
      'server:github',
      'preset:read-only',
    ]);
    expect(event).toEqual({
      name: 'AgentPlatform.agentViewed',
      attributes: { skills: '2-4', tools: '10-19' },
    });
  });

  it('waits while the carrier is read', () => {
    const event = render(makeAgent(), {
      declared: { state: 'unresolved', carrier: 'pr-reviewer' },
      isReading: true,
      isUnreadable: false,
    });

    expect(event).toBeUndefined();
  });

  it('waits while muster resolves the toolset', () => {
    mockUseToolsetResolution.mockReturnValue(
      resolution({ status: 'loading', isLoading: true }),
    );

    expect(render(makeAgent(), declared(['server:github']))).toBeUndefined();
  });

  it('waits for the agent', () => {
    expect(render(undefined, undefined)).toBeUndefined();
  });

  it('resolves an agent without a declared toolset as the full preset it reaches', () => {
    mockUseToolsetResolution.mockReturnValue(
      resolution({ tools: resolvedTools(150) }),
    );

    const event = render(makeAgent(), {
      declared: { state: 'implicit-full', carrier: 'pr-reviewer' },
      isReading: false,
      isUnreadable: false,
    });

    expect(mockUseToolsetResolution).toHaveBeenCalledWith('gazelle', [
      'preset:full',
    ]);
    expect(event?.attributes).toEqual({ skills: '0', tools: '100+' });
  });

  it('counts no tools for preset:none, without asking muster', () => {
    const event = render(makeAgent(), declared(['preset:none']));

    expect(mockUseToolsetResolution).toHaveBeenCalledWith('gazelle', []);
    expect(event?.attributes).toEqual({ skills: '0', tools: '0' });
  });

  it('counts no tools for an agent without the gateway', () => {
    const event = render(makeAgent({ bindings: [] }), {
      declared: { state: 'no-gateway' },
      isReading: false,
      isUnreadable: false,
    });

    expect(event?.attributes).toEqual({ skills: '0', tools: '0' });
  });

  it('adds the tools listed on a directly bound server', () => {
    mockUseToolsetResolution.mockReturnValue(
      resolution({ tools: resolvedTools(3) }),
    );

    const event = render(
      makeAgent({
        bindings: [
          { name: 'pr-reviewer' },
          { name: 'grafana', tools: ['query', 'dashboards'] },
        ],
      }),
      declared(['server:github']),
    );

    expect(event?.attributes).toHaveProperty('tools', '5-9');
  });

  it.each<[string, ToolsetResolution]>([
    ['muster cannot be asked', resolution({ status: 'unavailable' })],
    ['the resolution failed', resolution({ status: 'error', error: 'x' })],
    ['muster refused a preset', resolution({ status: 'unknown-preset' })],
    ['muster predates toolsets', resolution({ status: 'unsupported' })],
  ])('reports the tools as unknown when %s', (_, answer) => {
    mockUseToolsetResolution.mockReturnValue(answer);

    const event = render(makeAgent({ skills: 1 }), declared(['server:github']));

    expect(event?.attributes).toEqual({ skills: '1', tools: 'unknown' });
  });

  it('reports the tools as unknown when the carrier cannot be read', () => {
    const event = render(makeAgent(), {
      declared: { state: 'unresolved', carrier: 'pr-reviewer' },
      isReading: false,
      isUnreadable: true,
    });

    expect(event?.attributes).toHaveProperty('tools', 'unknown');
  });

  it('reports the tools as unknown when a directly bound server allows all of its tools', () => {
    mockUseToolsetResolution.mockReturnValue(
      resolution({ tools: resolvedTools(3) }),
    );

    const event = render(
      makeAgent({ bindings: [{ name: 'pr-reviewer' }, { name: 'grafana' }] }),
      declared(['server:github']),
    );

    expect(event?.attributes).toHaveProperty('tools', 'unknown');
  });
});
