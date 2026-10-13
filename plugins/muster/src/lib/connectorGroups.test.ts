import { MCPServer, TOOL_GROUP_LABEL } from './k8s';
import {
  CONNECTOR_GROUPS,
  connectorGroup,
  connectorGroupCounts,
  connectorGroupOfPath,
} from './connectorGroups';

function makeServer(opts: {
  name: string;
  family?: string;
  toolGroup?: string;
}): MCPServer {
  return new MCPServer(
    {
      apiVersion: 'muster.giantswarm.io/v1alpha1',
      kind: 'MCPServer',
      metadata: {
        name: opts.name,
        labels: opts.toolGroup ? { [TOOL_GROUP_LABEL]: opts.toolGroup } : {},
      },
      spec: opts.family ? { family: { name: opts.family } } : {},
    } as never,
    'gazelle',
  );
}

describe('connectorGroup', () => {
  it('lists muster itself as internal', () => {
    expect(connectorGroup({ kind: 'core' })).toBe('internal');
  });

  it('lists a singular server by its tool-group label, never as a family', () => {
    const group = (toolGroup?: string) =>
      connectorGroup({
        kind: 'server',
        server: makeServer({ name: 's', toolGroup }),
      });
    expect(group('agent-platform')).toBe('internal');
    // Shipped by the platform, but one instance: not a family.
    expect(group('infrastructure')).toBe('internal');
    expect(group()).toBe('yours');
    // A typo in a chart's values is no declared group.
    expect(group('agent-plat')).toBe('yours');
  });

  it('sorts a family by its members’ label, and an unlabelled one as a family', () => {
    const family = (...toolGroups: Array<string | undefined>) =>
      connectorGroup({
        kind: 'family',
        family: 'kubernetes',
        servers: toolGroups.map((toolGroup, index) =>
          makeServer({
            name: `mc${index}-kubernetes`,
            family: 'kubernetes',
            toolGroup,
          }),
        ),
      });
    expect(family('infrastructure', 'infrastructure')).toBe('families');
    // A label rollout in flight: the labelled members decide.
    expect(family('infrastructure', undefined)).toBe('families');
    expect(family('agent-platform', 'agent-platform')).toBe('internal');
    expect(family(undefined, undefined)).toBe('families');
  });
});

describe('connectorGroupCounts', () => {
  it('counts nothing, muster included, where muster does not run', () => {
    expect(connectorGroupCounts([], false)).toEqual({
      yours: 0,
      families: 0,
      internal: 0,
    });
  });

  it('counts a family once and muster itself among the internal ones', () => {
    expect(
      connectorGroupCounts(
        [
          makeServer({ name: 'github' }),
          makeServer({ name: 'jira' }),
          makeServer({ name: 'agent-manager', toolGroup: 'agent-platform' }),
          makeServer({
            name: 'a-kubernetes',
            family: 'kubernetes',
            toolGroup: 'infrastructure',
          }),
          makeServer({
            name: 'b-kubernetes',
            family: 'kubernetes',
            toolGroup: 'infrastructure',
          }),
        ],
        true,
      ),
    ).toEqual({ yours: 2, families: 1, internal: 2 });
  });
});

describe('connectorGroupOfPath', () => {
  it('maps each sub-tab path back to its group, and nothing else', () => {
    for (const group of CONNECTOR_GROUPS) {
      expect(connectorGroupOfPath(group.path)).toBe(group.id);
    }
    expect(connectorGroupOfPath('jira')).toBeUndefined();
  });
});
