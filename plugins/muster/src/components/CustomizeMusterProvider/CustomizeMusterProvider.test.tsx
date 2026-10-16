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
  it('counts a family once, muster itself, each sub-tab, and the workflows', () => {
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
    expect(result.current).toEqual({
      connectors: 3,
      connectorGroups: { yours: 2, infrastructure: 0, internal: 1 },
      workflows: 1,
    });
  });

  it('holds the workflows count while their own read is pending, the servers counted', () => {
    mockInstance = makeTestMusterInstance({
      mcpServers: [server('github')],
      isLoadingWorkflows: true,
    });
    const { result } = renderHook(() => useMusterCustomizeCounts());
    // github, and muster itself among the internal ones.
    expect(result.current).toEqual({
      connectors: 2,
      connectorGroups: { yours: 1, infrastructure: 0, internal: 1 },
      workflows: 'loading',
    });
  });

  it('leaves muster out where no installation runs it', () => {
    mockInstance = makeTestMusterInstance({
      activeInstallation: undefined,
      mcpServers: [],
    });
    const { result } = renderHook(() => useMusterCustomizeCounts());
    expect(result.current).toEqual({
      connectors: 0,
      connectorGroups: { yours: 0, infrastructure: 0, internal: 0 },
      workflows: 0,
    });
  });

  it('says every count is still loading while muster is read', () => {
    mockInstance = makeTestMusterInstance({ isLoading: true });
    const { result } = renderHook(() => useMusterCustomizeCounts());
    expect(result.current).toEqual({
      connectors: 'loading',
      connectorGroups: {
        yours: 'loading',
        infrastructure: 'loading',
        internal: 'loading',
      },
      workflows: 'loading',
    });
  });
});
