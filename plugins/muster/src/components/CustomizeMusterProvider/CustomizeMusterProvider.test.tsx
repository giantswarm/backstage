import { renderHook } from '@testing-library/react';
import { MCPServer, MusterWorkflow } from '../../lib/k8s';
import { makeTestMusterInstance } from '../MusterInstanceProvider/testInstance';
import { useMusterCustomizeCounts } from './CustomizeMusterProvider';

let mockInstance = makeTestMusterInstance();
jest.mock('../MusterInstanceProvider', () => ({
  useMusterInstance: () => mockInstance,
}));

function server(name: string, family?: string) {
  return new MCPServer(
    {
      apiVersion: 'muster.giantswarm.io/v1alpha1',
      kind: 'MCPServer',
      metadata: { name },
      spec: {
        type: 'streamable-http',
        url: 'https://x.test/mcp',
        ...(family
          ? { family: { name: family, instanceArg: 'management_cluster' } }
          : {}),
      },
    } as never,
    'gazelle',
  );
}

describe('useMusterCustomizeCounts', () => {
  it('counts a family once, and the workflows', () => {
    mockInstance = makeTestMusterInstance({
      mcpServers: [
        server('a-kubernetes', 'kubernetes'),
        server('b-kubernetes', 'kubernetes'),
        server('github'),
      ],
      workflows: [
        new MusterWorkflow(
          {
            apiVersion: 'muster.giantswarm.io/v1alpha1',
            kind: 'Workflow',
            metadata: { name: 'wf' },
            spec: { steps: [] },
          } as never,
          'gazelle',
        ),
      ],
    });
    const { result } = renderHook(() => useMusterCustomizeCounts());
    expect(result.current).toEqual({ connectors: 2, workflows: 1 });
  });

  it('counts nothing while loading', () => {
    mockInstance = makeTestMusterInstance({ isLoading: true });
    const { result } = renderHook(() => useMusterCustomizeCounts());
    expect(result.current).toEqual({});
  });
});
