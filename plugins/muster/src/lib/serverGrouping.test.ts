import {
  MCPServer,
  MANAGEMENT_CLUSTER_LABEL,
  TOOL_GROUP_LABEL,
  ToolGroup,
} from './k8s';
import {
  ServerRow,
  familyCoverage,
  familyGroups,
  familyToolGroup,
  findServerRow,
  fleetManagementClusters,
  orderPresenceDegradedFirst,
  partitionServers,
  presenceByMc,
  selectRepresentative,
  serverRowKey,
} from './serverGrouping';

function makeServer(opts: {
  name: string;
  family?: string;
  mc?: string;
  state?: string;
  /** The tool-group label value; `undefined` leaves the CR unlabelled. */
  toolGroup?: ToolGroup | string;
  /** `spec.suspended`: the server is deactivated. */
  suspended?: boolean;
}): MCPServer {
  return new MCPServer(
    {
      apiVersion: 'muster.giantswarm.io/v1alpha1',
      kind: 'MCPServer',
      metadata: {
        name: opts.name,
        labels: {
          ...(opts.mc ? { [MANAGEMENT_CLUSTER_LABEL]: opts.mc } : {}),
          ...(opts.toolGroup ? { [TOOL_GROUP_LABEL]: opts.toolGroup } : {}),
        },
      },
      spec: {
        ...(opts.family ? { family: { name: opts.family } } : {}),
        ...(opts.suspended ? { suspended: true } : {}),
      },
      status: opts.state ? { state: opts.state } : {},
    } as never,
    opts.mc ?? 'gazelle',
  );
}

/** Narrows a row to a family row, failing the test if it is not one. */
function familyRow(row: ServerRow): Extract<ServerRow, { kind: 'family' }> {
  if (row.kind !== 'family') {
    throw new Error(`expected a family row, got ${row.kind}`);
  }
  return row;
}

/** A row as `family:<name>` or `server:<name>`, for order assertions. */
function rowId(row: ServerRow): string {
  return row.kind === 'family'
    ? `family:${row.family}`
    : `server:${row.server.getName()}`;
}

describe('partitionServers', () => {
  // A labelled fleet: the managers declare agent-platform, the three
  // federated families declare infrastructure on every cluster, and the
  // installation's own integrations carry no label.
  const labelledFleet = () => [
    makeServer({ name: 'pro' }),
    makeServer({ name: 'model-manager', toolGroup: 'agent-platform' }),
    makeServer({
      name: 'prometheus-beta',
      family: 'prometheus',
      mc: 'beta',
      toolGroup: 'infrastructure',
    }),
    makeServer({
      name: 'kubernetes-beta',
      family: 'kubernetes',
      mc: 'beta',
      toolGroup: 'infrastructure',
    }),
    makeServer({
      name: 'kubernetes-alpha',
      family: 'kubernetes',
      mc: 'alpha',
      toolGroup: 'infrastructure',
    }),
    makeServer({ name: 'agent-manager', toolGroup: 'agent-platform' }),
    makeServer({ name: 'github' }),
    makeServer({
      name: 'capi-alpha',
      family: 'capi',
      mc: 'alpha',
      toolGroup: 'infrastructure',
    }),
  ];

  it('lists the three tool groups in display order, always', () => {
    expect(partitionServers([]).map(g => g.group)).toEqual([
      'agent-platform',
      'infrastructure',
      'registered',
    ]);
    expect(partitionServers(labelledFleet()).map(g => g.group)).toEqual([
      'agent-platform',
      'infrastructure',
      'registered',
    ]);
  });

  it('places labelled servers by tier, families collapsed to one row, sorted', () => {
    const [agentPlatform, infrastructure, registered] =
      partitionServers(labelledFleet());

    expect(agentPlatform.rows.map(rowId)).toEqual([
      'server:agent-manager',
      'server:model-manager',
    ]);
    expect(infrastructure.rows.map(rowId)).toEqual([
      'family:capi',
      'family:kubernetes',
      'family:prometheus',
    ]);
    expect(registered.rows.map(rowId)).toEqual(['server:github', 'server:pro']);

    expect(
      familyRow(infrastructure.rows[1]).servers.map(s =>
        s.getManagementCluster(),
      ),
    ).toEqual(['beta', 'alpha']);
  });

  it('lists everything under Registered servers when no CR carries the label (fallback)', () => {
    // An installation whose charts have not rolled the label yet: the page
    // degrades to one long list, never to an empty or broken one.
    const [agentPlatform, infrastructure, registered] = partitionServers([
      makeServer({ name: 'kubernetes-a', family: 'kubernetes', mc: 'alpha' }),
      makeServer({ name: 'kubernetes-b', family: 'kubernetes', mc: 'beta' }),
      makeServer({ name: 'prometheus-a', family: 'prometheus', mc: 'alpha' }),
      makeServer({ name: 'agent-manager' }),
      makeServer({ name: 'customer-integration' }),
    ]);

    expect(agentPlatform.rows).toEqual([]);
    expect(infrastructure.rows).toEqual([]);
    expect(registered.rows.map(rowId)).toEqual([
      'family:kubernetes',
      'family:prometheus',
      'server:agent-manager',
      'server:customer-integration',
    ]);
  });

  it('puts family rows before singular rows within a tier', () => {
    const [, infrastructure] = partitionServers([
      makeServer({ name: 'aaa-standalone-k8s', toolGroup: 'infrastructure' }),
      makeServer({
        name: 'zzz-k8s',
        family: 'kubernetes',
        mc: 'alpha',
        toolGroup: 'infrastructure',
      }),
    ]);

    expect(infrastructure.rows.map(rowId)).toEqual([
      'family:kubernetes',
      'server:aaa-standalone-k8s',
    ]);
  });

  it('treats an unknown label value as unlabelled', () => {
    const [agentPlatform, infrastructure, registered] = partitionServers([
      makeServer({ name: 'typo', toolGroup: 'Infrastructure' }),
    ]);

    expect(agentPlatform.rows).toEqual([]);
    expect(infrastructure.rows).toEqual([]);
    expect(registered.rows.map(rowId)).toEqual(['server:typo']);
  });

  it('keeps a family in one row while its label rolls out across the fleet', () => {
    // Mid-rollout: two of three clusters carry the label already. The family
    // must not split into an Infrastructure row and a Registered row.
    const partition = partitionServers([
      makeServer({ name: 'k8s-alpha', family: 'kubernetes', mc: 'alpha' }),
      makeServer({
        name: 'k8s-beta',
        family: 'kubernetes',
        mc: 'beta',
        toolGroup: 'infrastructure',
      }),
      makeServer({
        name: 'k8s-gamma',
        family: 'kubernetes',
        mc: 'gamma',
        toolGroup: 'infrastructure',
      }),
    ]);

    expect(partition.map(g => g.rows.map(rowId))).toEqual([
      [],
      ['family:kubernetes'],
      [],
    ]);
    expect(familyRow(partition[1].rows[0]).servers).toHaveLength(3);
  });
});

describe('familyToolGroup', () => {
  it('is registered when no member is labelled', () => {
    expect(
      familyToolGroup([
        makeServer({ name: 'a', family: 'f', mc: 'alpha' }),
        makeServer({ name: 'b', family: 'f', mc: 'beta' }),
      ]),
    ).toBe('registered');
  });

  it('follows the labelled members, majority first', () => {
    expect(
      familyToolGroup([
        makeServer({ name: 'a', family: 'f', mc: 'alpha' }),
        makeServer({
          name: 'b',
          family: 'f',
          mc: 'beta',
          toolGroup: 'infrastructure',
        }),
        makeServer({
          name: 'c',
          family: 'f',
          mc: 'gamma',
          toolGroup: 'infrastructure',
        }),
        makeServer({
          name: 'd',
          family: 'f',
          mc: 'delta',
          toolGroup: 'agent-platform',
        }),
      ]),
    ).toBe('infrastructure');
  });

  it('breaks a tie by display order', () => {
    expect(
      familyToolGroup([
        makeServer({
          name: 'a',
          family: 'f',
          mc: 'alpha',
          toolGroup: 'infrastructure',
        }),
        makeServer({
          name: 'b',
          family: 'f',
          mc: 'beta',
          toolGroup: 'agent-platform',
        }),
      ]),
    ).toBe('agent-platform');
  });
});

describe('familyGroups', () => {
  it('collects the family rows of every tier, alphabetical', () => {
    const groups = familyGroups(
      partitionServers([
        makeServer({
          name: 'prom-alpha',
          family: 'prometheus',
          mc: 'alpha',
          toolGroup: 'infrastructure',
        }),
        // A family an installation labelled agent-platform, and one it did
        // not label at all: fleet coverage counts both.
        makeServer({
          name: 'mgr-alpha',
          family: 'managers',
          mc: 'alpha',
          toolGroup: 'agent-platform',
        }),
        makeServer({ name: 'k8s-alpha', family: 'kubernetes', mc: 'alpha' }),
        makeServer({ name: 'k8s-beta', family: 'kubernetes', mc: 'beta' }),
        makeServer({ name: 'pro' }),
      ]),
    );

    expect(groups.map(g => g.family)).toEqual([
      'kubernetes',
      'managers',
      'prometheus',
    ]);
    expect(groups[0].servers).toHaveLength(2);
  });
});

describe('presenceByMc', () => {
  it('reports one entry per management cluster, sorted, with the worst state', () => {
    const presence = presenceByMc([
      makeServer({ name: 'k8s-beta', mc: 'beta', state: 'Failed' }),
      makeServer({ name: 'k8s-beta-2', mc: 'beta', state: 'Connected' }),
      makeServer({ name: 'k8s-alpha', mc: 'alpha', state: 'Connected' }),
    ]);

    expect(presence.map(p => p.mc)).toEqual(['alpha', 'beta']);
    expect(presence[0].severity).toBe('ok');
    expect(presence[1].severity).toBe('error');
    expect(presence[1].state).toBe('Failed');
  });

  it('treats Auth Required as healthy (not degraded)', () => {
    const presence = presenceByMc([
      makeServer({ name: 'k8s', mc: 'alpha', state: 'Auth Required' }),
    ]);
    expect(presence[0].severity).toBe('ok');
  });

  it('treats Awaiting Session as healthy: the federated fleet between sessions', () => {
    // Every remote cluster's server is served per session through token
    // exchange; with nobody connected the whole fleet reads Awaiting Session,
    // which must not paint every pill amber.
    const presence = presenceByMc([
      makeServer({ name: 'k8s-alpha', mc: 'alpha', state: 'Awaiting Session' }),
      makeServer({ name: 'k8s-beta', mc: 'beta', state: 'Awaiting Session' }),
    ]);
    expect(presence.map(p => p.severity)).toEqual(['ok', 'ok']);
    expect(presence[0].state).toBe('Awaiting Session');
  });

  it('names a deactivated instance rather than its Disconnected symptom', () => {
    // The pill still counts as degraded (the cluster's tools are unavailable),
    // but the text says why, so nobody goes looking for an outage.
    const presence = presenceByMc([
      makeServer({
        name: 'k8s',
        mc: 'alpha',
        state: 'Disconnected',
        suspended: true,
      }),
    ]);
    expect(presence[0].severity).toBe('warning');
    expect(presence[0].state).toBe('Deactivated');
  });
});

describe('selectRepresentative', () => {
  // Federated families are listed in MC-alphabetical order, so the first server
  // is a peer/customer MC; selection must not default to it (ADR D1).
  const fleet = () => [
    makeServer({ name: 'k8s-agama', mc: 'agama', state: 'Auth Required' }),
    makeServer({ name: 'k8s-gazelle', mc: 'gazelle', state: 'Connected' }),
    makeServer({ name: 'k8s-zebra', mc: 'zebra', state: 'Auth Required' }),
  ];

  it('prefers the active installation own server over list order', () => {
    const rep = selectRepresentative(fleet(), 'gazelle');
    expect(rep?.server.getManagementCluster()).toBe('gazelle');
    expect(rep?.qualified).toBe(true);
  });

  it('prefers a connected server when the active installation has none of its own', () => {
    const rep = selectRepresentative(fleet(), 'not-in-fleet');
    expect(rep?.server.getManagementCluster()).toBe('gazelle');
    expect(rep?.qualified).toBe(true);
  });

  it('does not default to the first (Auth Required) server by list order', () => {
    const rep = selectRepresentative(
      [
        makeServer({ name: 'k8s-agama', mc: 'agama', state: 'Auth Required' }),
        makeServer({ name: 'k8s-beta', mc: 'beta', state: 'Connected' }),
      ],
      undefined,
    );
    expect(rep?.server.getManagementCluster()).toBe('beta');
  });

  it('falls back to the first server but flags it unqualified when none own/connected', () => {
    const rep = selectRepresentative(
      [
        makeServer({ name: 'k8s-agama', mc: 'agama', state: 'Auth Required' }),
        makeServer({ name: 'k8s-zebra', mc: 'zebra', state: 'Failed' }),
      ],
      'gazelle',
    );
    expect(rep?.server.getManagementCluster()).toBe('agama');
    expect(rep?.qualified).toBe(false);
  });

  it('returns undefined for an empty fleet', () => {
    expect(selectRepresentative([], 'gazelle')).toBeUndefined();
  });
});

describe('orderPresenceDegradedFirst', () => {
  it('puts failed before disconnected before healthy, alphabetical within a band', () => {
    const presence = presenceByMc([
      makeServer({ name: 'a', mc: 'agama', state: 'Connected' }),
      makeServer({ name: 'b', mc: 'zebra', state: 'Failed' }),
      makeServer({ name: 'c', mc: 'garm', state: 'Disconnected' }),
      makeServer({ name: 'd', mc: 'alba', state: 'Auth Required' }),
      makeServer({ name: 'e', mc: 'beta', state: 'Failed' }),
    ]);

    expect(orderPresenceDegradedFirst(presence).map(p => p.mc)).toEqual([
      'beta',
      'zebra',
      'garm',
      'agama',
      'alba',
    ]);
  });
});

describe('fleetManagementClusters / familyCoverage', () => {
  const kubernetes = {
    family: 'kubernetes',
    servers: ['agama', 'alba', 'gaggle', 'garm'].map(mc =>
      makeServer({
        name: `k8s-${mc}`,
        family: 'kubernetes',
        mc,
        state: mc === 'garm' ? 'Failed' : 'Connected',
      }),
    ),
  };
  // A family mid-rollout: deployed on two of the four clusters.
  const capi = {
    family: 'capi',
    servers: ['gaggle', 'garm'].map(mc =>
      makeServer({
        name: `capi-${mc}`,
        family: 'capi',
        mc,
        state: 'Connected',
      }),
    ),
  };

  it('unions the clusters of every family, sorted', () => {
    expect(fleetManagementClusters([capi, kubernetes])).toEqual([
      'agama',
      'alba',
      'gaggle',
      'garm',
    ]);
  });

  it('reports a partially rolled-out family as missing from the rest of the fleet', () => {
    const coverage = familyCoverage(
      capi,
      fleetManagementClusters([capi, kubernetes]),
    );

    expect(coverage.present.map(p => p.mc)).toEqual(['gaggle', 'garm']);
    expect(coverage.missing).toEqual(['agama', 'alba']);
    expect(coverage.degraded).toEqual([]);
    expect(coverage.fleetSize).toBe(4);
  });

  it('reports a fully deployed family with its degraded clusters first', () => {
    const coverage = familyCoverage(
      kubernetes,
      fleetManagementClusters([capi, kubernetes]),
    );

    expect(coverage.missing).toEqual([]);
    expect(coverage.present.map(p => p.mc)).toEqual([
      'garm',
      'agama',
      'alba',
      'gaggle',
    ]);
    expect(coverage.degraded.map(p => p.mc)).toEqual(['garm']);
  });
});

describe('findServerRow', () => {
  const servers = [
    makeServer({ name: 'walrus-mcp-kubernetes', family: 'kubernetes' }),
    makeServer({ name: 'gazelle-mcp-kubernetes', family: 'kubernetes' }),
    makeServer({ name: 'aws-root' }),
    // A singular CR sharing the family's name: the family's page wins.
    makeServer({ name: 'kubernetes' }),
  ];

  it('resolves a family name to the family row, its instances by name', () => {
    const row = findServerRow(servers, 'kubernetes');
    expect(row?.kind).toBe('family');
    expect(row?.kind === 'family' && row.servers.map(s => s.getName())).toEqual(
      ['gazelle-mcp-kubernetes', 'walrus-mcp-kubernetes'],
    );
  });

  it('resolves a singular CR by its name', () => {
    const row = findServerRow(servers, 'aws-root');
    expect(row?.kind === 'server' && row.server.getName()).toBe('aws-root');
  });

  it('does not resolve a family instance on its own', () => {
    // Instances are a detail of their family's page, never a page of their own.
    expect(findServerRow(servers, 'walrus-mcp-kubernetes')).toBeUndefined();
  });

  it('resolves `muster` to muster itself', () => {
    expect(findServerRow([], 'muster')).toEqual({ kind: 'core' });
  });

  it('is undefined for a server the installation does not have', () => {
    expect(findServerRow(servers, 'nope')).toBeUndefined();
  });

  it('round-trips through serverRowKey', () => {
    for (const key of ['kubernetes', 'aws-root', 'muster']) {
      expect(serverRowKey(findServerRow(servers, key)!)).toBe(key);
    }
  });
});
