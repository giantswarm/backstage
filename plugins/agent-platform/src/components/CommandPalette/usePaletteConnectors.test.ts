import { renderHook } from '@testing-library/react';
import { usePaletteConnectors } from './usePaletteConnectors';

type FakeServer = {
  cluster: string;
  getName: () => string;
  getFamily: () => string | undefined;
};

let mockResources: FakeServer[] = [];
jest.mock('@giantswarm/backstage-plugin-kubernetes-react', () => ({
  useResources: () => ({ resources: mockResources, isLoading: false }),
}));
jest.mock('@giantswarm/backstage-plugin-muster', () => ({
  MCPServer: class {},
  mcpServerDisplayNames: () => new Map([['jira', 'Jira']]),
}));

function server(cluster: string, name: string, family?: string): FakeServer {
  return { cluster, getName: () => name, getFamily: () => family };
}

describe('usePaletteConnectors', () => {
  it('lists a connector once per installation, a family as one row there', () => {
    mockResources = [
      server('golem', 'jira'),
      server('gazelle', 'jira'),
      server('gazelle', 'kubernetes-a', 'kubernetes'),
      server('gazelle', 'kubernetes-b', 'kubernetes'),
    ];

    const { result } = renderHook(() =>
      usePaletteConnectors(['gazelle', 'golem']),
    );

    expect(result.current.rows).toEqual([
      { page: 'jira', displayName: 'Jira', installation: 'gazelle' },
      { page: 'jira', displayName: 'Jira', installation: 'golem' },
      {
        page: 'kubernetes',
        displayName: 'kubernetes',
        installation: 'gazelle',
      },
    ]);
  });
});
