import { renderHook } from '@testing-library/react';
import { MCPServer } from '@giantswarm/backstage-plugin-muster';
import { usePaletteConnectors } from './usePaletteConnectors';

let mockResources: MCPServer[] = [];
jest.mock('@giantswarm/backstage-plugin-kubernetes-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-kubernetes-react'),
  useResources: () => ({ resources: mockResources, isLoading: false }),
}));
jest.mock('@giantswarm/backstage-plugin-muster', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-muster'),
  // Until muster names its servers, the CRs are keyed by muster's rule.
  useMusterKeyedServers: (servers: MCPServer[]) => servers,
}));

function server(
  cluster: string,
  name: string,
  {
    family,
    namespace = 'agent-platform',
    displayName,
  }: { family?: string; namespace?: string; displayName?: string } = {},
): MCPServer {
  return new MCPServer(
    {
      apiVersion: 'muster.giantswarm.io/v1alpha1',
      kind: 'MCPServer',
      metadata: {
        name,
        namespace,
        ...(displayName
          ? { annotations: { 'ui.giantswarm.io/display-name': displayName } }
          : {}),
      },
      spec: {
        type: 'streamable-http',
        url: `https://${name}.example.test`,
        ...(family ? { family: { name: family } } : {}),
      },
    } as never,
    cluster,
  );
}

describe('usePaletteConnectors', () => {
  it('lists a connector once per installation, a family as one row there, each named by its installation', () => {
    mockResources = [
      server('golem', 'jira', { displayName: 'Atlassian' }),
      server('gazelle', 'jira', { displayName: 'Jira' }),
      server('gazelle', 'kubernetes-a', { family: 'kubernetes' }),
      server('gazelle', 'kubernetes-b', { family: 'kubernetes' }),
    ];

    const { result } = renderHook(() =>
      usePaletteConnectors(['gazelle', 'golem']),
    );

    expect(result.current.rows).toEqual([
      {
        key: 'server:jira',
        page: 'jira',
        displayName: 'Atlassian',
        installation: 'golem',
      },
      {
        key: 'server:jira',
        page: 'jira',
        displayName: 'Jira',
        installation: 'gazelle',
      },
      {
        key: 'family:kubernetes',
        page: 'kubernetes',
        displayName: 'kubernetes',
        installation: 'gazelle',
      },
    ]);
  });

  it("lists two organizations' connectors of one name apart, by their display names, each at its own address", () => {
    mockResources = [
      server('gazelle', 'wiki', {
        namespace: 'org-gazelle',
        displayName: 'Gazelle wiki',
      }),
      server('gazelle', 'wiki', {
        namespace: 'org-golem',
        displayName: 'Golem wiki',
      }),
      server('gazelle', 'notes', {
        namespace: 'org-golem',
        displayName: 'Golem notes',
      }),
    ];

    const { result } = renderHook(() => usePaletteConnectors(['gazelle']));

    expect(result.current.rows).toEqual([
      {
        key: 'server:org-gazelle/wiki',
        page: '-/org-gazelle/wiki',
        displayName: 'Gazelle wiki',
        installation: 'gazelle',
      },
      {
        key: 'server:org-golem/notes',
        page: '-/org-golem/notes',
        displayName: 'Golem notes',
        installation: 'gazelle',
      },
      {
        key: 'server:org-golem/wiki',
        page: '-/org-golem/wiki',
        displayName: 'Golem wiki',
        installation: 'gazelle',
      },
    ]);
  });
});
