import { renderHook } from '@testing-library/react';
import type { AgentRow } from '../components/AgentsDataProvider';
import { useMetaAgent } from './useMetaAgent';

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

let agentRows: AgentRow[] = [];
jest.mock('../components/AgentsDataProvider', () => ({
  useAgents: () => ({ rows: agentRows, isLoading: false }),
}));

function agent(
  installation: string,
  namespace: string,
  technicalName: string,
): AgentRow {
  return {
    id: `${installation}/${namespace}/${technicalName}`,
    installation,
    namespace,
    name: technicalName,
    technicalName,
    description: '',
    skillCount: 0,
    readiness: 'ready',
  } as AgentRow;
}

describe('useMetaAgent', () => {
  beforeEach(() => {
    configuredRoles = {};
    agentRows = [];
  });

  it('resolves the configured name against the agents, home first', () => {
    configuredRoles = { skillEvaluation: 'skill-evaluator' };
    agentRows = [
      agent('gazelle', 'kagent', 'skill-evaluator'),
      agent('golem', 'kagent', 'skill-evaluator'),
    ];

    const { result } = renderHook(() => useMetaAgent('skillEvaluation'));

    expect(result.current?.installation).toBe('gazelle');
  });

  it('resolves a namespace-qualified name', () => {
    configuredRoles = { skillEvaluation: 'platform/skill-evaluator' };
    agentRows = [
      agent('gazelle', 'kagent', 'skill-evaluator'),
      agent('gazelle', 'platform', 'skill-evaluator'),
    ];

    const { result } = renderHook(() => useMetaAgent('skillEvaluation'));

    expect(result.current?.namespace).toBe('platform');
  });

  it('resolves nothing while the role is unconfigured', () => {
    agentRows = [agent('gazelle', 'kagent', 'skill-evaluator')];

    const { result } = renderHook(() => useMetaAgent('skillEvaluation'));

    expect(result.current).toBeUndefined();
  });

  it('resolves nothing when the configured name matches no agent', () => {
    configuredRoles = { skillEvaluation: 'gone-agent' };
    agentRows = [agent('gazelle', 'kagent', 'skill-evaluator')];

    const { result } = renderHook(() => useMetaAgent('skillEvaluation'));

    expect(result.current).toBeUndefined();
  });
});
