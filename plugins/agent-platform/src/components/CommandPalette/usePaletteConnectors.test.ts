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
  // Stands in for muster's rule: the name the installation's CRs give.
  mcpServerDisplayNames: (servers: { cluster: string }[]) =>
    new Map([['jira', servers[0].cluster === 'golem' ? 'Atlassian' : 'Jira']]),
}));

function server(cluster: string, name: string, family?: string): FakeServer {
  return { cluster, getName: () => name, getFamily: () => family };
}

describe('usePaletteConnectors', () => {
  it('lists a connector once per installation, a family as one row there, each named by its installation', () => {
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
      { page: 'jira', displayName: 'Atlassian', installation: 'golem' },
      { page: 'jira', displayName: 'Jira', installation: 'gazelle' },
      {
        page: 'kubernetes',
        displayName: 'kubernetes',
        installation: 'gazelle',
      },
    ]);
  });
});
