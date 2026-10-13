import { renderHook } from '@testing-library/react';
import {
  Agent,
  type AgentInterface,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { useModelAgents } from './useModelAgents';

const mockUseResources = jest.fn();
jest.mock('@giantswarm/backstage-plugin-kubernetes-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-kubernetes-react'),
  useResources: (...args: unknown[]) => mockUseResources(...args),
}));

function agent(name: string, modelConfig: string): Agent {
  return new Agent(
    {
      apiVersion: 'kagent.dev/v1alpha3',
      kind: 'Agent',
      metadata: { name, namespace: 'kagent' },
      spec: { template: { modelConfig: { name: modelConfig } } },
    } as unknown as AgentInterface,
    'inst-1',
  );
}

describe('useModelAgents', () => {
  it("reads the agents of the model's namespace on its installation, and keeps those on it", () => {
    mockUseResources.mockReturnValue({
      resources: [agent('triage', 'sonnet'), agent('review', 'haiku')],
      isLoading: false,
      errors: [],
    });

    const { result } = renderHook(() =>
      useModelAgents('inst-1', 'kagent', 'sonnet'),
    );

    expect(mockUseResources).toHaveBeenCalledWith(
      'inst-1',
      Agent,
      { 'inst-1': { namespace: 'kagent' } },
      { enableDiscovery: false },
    );
    expect(result.current.agents.map(row => row.technicalName)).toEqual([
      'triage',
    ]);
    expect(result.current.isUnreadable).toBe(false);
  });

  it('says the agents could not be read when the list failed', () => {
    mockUseResources.mockReturnValue({
      resources: [],
      isLoading: false,
      errors: [{ cluster: 'inst-1', error: new Error('forbidden') }],
    });

    const { result } = renderHook(() =>
      useModelAgents('inst-1', 'kagent', 'sonnet'),
    );

    expect(result.current.isUnreadable).toBe(true);
  });
});
