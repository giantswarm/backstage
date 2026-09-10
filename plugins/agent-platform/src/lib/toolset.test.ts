import type { ToolSummary } from '@giantswarm/backstage-plugin-muster';
import {
  buildCatalogue,
  catalogueInventory,
  countNoun,
  declaredToolset,
  groupWorkflows,
  isDestructive,
  isReadOnly,
  isUnknownPresetError,
  MAX_INLINE_SELECTORS,
  normalizeSelection,
  offeredPresets,
  orderPresets,
  OTHER_WORKFLOWS_KEY,
  parseSelector,
  parseToolsetHeader,
  presetLabel,
  selectorForTool,
  selectorProblem,
  serverOfTool,
  ServerInfo,
  toggleSelector,
  describeToolset,
  gatewayBindings,
  isGatewayBinding,
  toolsetOfAgent,
  toolsetProblems,
  toolsetShape,
  toolsetWasEvaluated,
  unsignedServerSelectors,
  withBuiltInPresets,
} from './toolset';

describe('selector grammar', () => {
  it('parses the four inline kinds with exact names', () => {
    expect(parseSelector('preset:read-only')).toEqual({
      kind: 'preset',
      name: 'read-only',
    });
    expect(parseSelector('server:mcp-kubernetes')).toEqual({
      kind: 'server',
      name: 'mcp-kubernetes',
    });
    expect(parseSelector('workflow:incident-triage')).toEqual({
      kind: 'workflow',
      name: 'incident-triage',
    });
    expect(parseSelector('tool:x_kubernetes_get_pods')).toEqual({
      kind: 'tool',
      name: 'x_kubernetes_get_pods',
    });
  });

  it('refuses the reserved and preset-only shapes with a reason', () => {
    expect(selectorProblem('toolset:shared')).toMatch(/reserved/);
    expect(selectorProblem('label:tier=x')).toMatch(/presets only/);
    expect(selectorProblem('read-only')).toMatch(/not a selector/);
    expect(selectorProblem('tool:has space')).toMatch(/not a selector/);
    expect(selectorProblem('tool:a,b')).toMatch(/not a selector/);
    expect(selectorProblem('')).toMatch(/empty/);
    expect(selectorProblem('preset:none')).toBeUndefined();
  });

  it('caps a toolset at 32 inline selectors and points at a preset', () => {
    const fine = Array.from(
      { length: MAX_INLINE_SELECTORS },
      (_, i) => `tool:x_srv_t${i}`,
    );
    expect(toolsetProblems(fine)).toEqual([]);
    const problems = toolsetProblems([...fine, 'tool:x_srv_one_more']);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/Define a preset/);
  });

  it('splits a rendered header back into selectors', () => {
    expect(
      parseToolsetHeader(' preset:read-only, workflow:incident-triage ,,'),
    ).toEqual(['preset:read-only', 'workflow:incident-triage']);
  });
});

describe('presets', () => {
  it('orders read-only, none, infrastructure, agent-platform, others, full last', () => {
    const ordered = orderPresets([
      { name: 'full' },
      { name: 'zeta' },
      { name: 'agent-platform' },
      { name: 'none' },
      { name: 'alpha' },
      { name: 'infrastructure' },
      { name: 'read-only' },
    ]);
    expect(ordered.map(p => p.name)).toEqual([
      'read-only',
      'none',
      'infrastructure',
      'agent-platform',
      'alpha',
      'zeta',
      'full',
    ]);
  });

  it('always knows the three built-ins, letting muster describe them', () => {
    const merged = withBuiltInPresets([
      { name: 'read-only', description: 'from muster', built_in: true },
      { name: 'infrastructure', description: 'label-selected' },
    ]);
    expect(merged.map(p => p.name)).toEqual([
      'read-only',
      'none',
      'infrastructure',
      'full',
    ]);
    expect(merged[0].description).toBe('from muster');
    expect(merged[1].description).toMatch(/No tools at all/);
  });

  it('offers every preset but none as a card — no tools is the empty selection', () => {
    const offered = offeredPresets(
      withBuiltInPresets([{ name: 'infrastructure' }]),
    );
    expect(offered.map(p => p.name)).toEqual([
      'read-only',
      'infrastructure',
      'full',
    ]);
  });

  it('declares the empty selection as preset:none and anything else as selected', () => {
    expect(declaredToolset([])).toEqual(['preset:none']);
    expect(declaredToolset(['preset:read-only', 'server:pro'])).toEqual([
      'preset:read-only',
      'server:pro',
    ]);
    expect(normalizeSelection(['preset:none'])).toEqual([]);
    expect(normalizeSelection(['preset:none', 'server:pro'])).toEqual([
      'server:pro',
    ]);
    expect(toolsetShape(declaredToolset([]))).toBe('none');
  });

  it('labels the shipped presets for people', () => {
    expect(presetLabel('read-only')).toBe('Read-only tools');
    expect(presetLabel('none')).toBe('No tools');
    expect(presetLabel('full')).toBe('Full gateway');
    expect(presetLabel('custom-thing')).toBe('custom-thing');
  });

  it('keeps full exclusive when toggling, and none clears the selection', () => {
    expect(toggleSelector([], 'preset:read-only')).toEqual([
      'preset:read-only',
    ]);
    expect(
      toggleSelector(['preset:read-only'], 'workflow:incident-triage'),
    ).toEqual(['preset:read-only', 'workflow:incident-triage']);
    expect(toggleSelector(['preset:read-only'], 'preset:none')).toEqual([]);
    expect(toggleSelector([], 'preset:none')).toEqual([]);
    expect(toggleSelector(['preset:none'], 'server:pro')).toEqual([
      'server:pro',
    ]);
    expect(toggleSelector(['server:pro'], 'preset:full')).toEqual([
      'preset:full',
    ]);
    expect(toggleSelector(['preset:full'], 'preset:full')).toEqual([]);
  });

  it('names the shape of a toolset for the loud labels', () => {
    expect(toolsetShape(['preset:none'])).toBe('none');
    expect(toolsetShape(['preset:full'])).toBe('full');
    expect(toolsetShape(['preset:read-only', 'server:pro'])).toBe('composed');
  });
});

describe('toolsetOfAgent', () => {
  const binding = (name: string) => ({
    server: { kind: 'RemoteMCPServer', name },
  });
  const agent = (...servers: string[]) => ({
    getName: () => 'pr-reviewer',
    getNamespace: () => 'kagent',
    getMcpBindings: () => servers.map(binding),
  });
  const carrier = (name: string, toolset?: string, namespace = 'kagent') => ({
    getName: () => name,
    getNamespace: () => namespace,
    getHeaderValue: (header: string) =>
      header === 'X-Muster-Toolset' ? toolset : undefined,
  });

  // The Generic chart renders the gateway into a RemoteMCPServer named after
  // the agent; a hand-written template may bind a shared gateway by name.
  it('recognises the agent’s own carrier and the shared gateway as gateway bindings', () => {
    expect(isGatewayBinding(agent(), binding('pr-reviewer'), 'muster')).toBe(
      true,
    );
    expect(isGatewayBinding(agent(), binding('muster'), 'muster')).toBe(true);
    expect(isGatewayBinding(agent(), binding('grafana'), 'muster')).toBe(false);
    expect(
      gatewayBindings(agent('grafana', 'pr-reviewer'), 'muster').map(
        b => b.server.name,
      ),
    ).toEqual(['pr-reviewer']);
  });

  it('reads the declared toolset off the carrier the gateway binding names', () => {
    expect(
      toolsetOfAgent(agent('pr-reviewer'), 'muster', [
        carrier('pr-reviewer', 'preset:read-only,workflow:incident-triage'),
      ]),
    ).toEqual({
      state: 'declared',
      selectors: ['preset:read-only', 'workflow:incident-triage'],
      carrier: 'pr-reviewer',
    });
  });

  it('reports implicit full access for a carrier without the header', () => {
    expect(
      toolsetOfAgent(agent('pr-reviewer'), 'muster', [carrier('pr-reviewer')]),
    ).toEqual({ state: 'implicit-full', carrier: 'pr-reviewer' });
  });

  it('reports no gateway when no binding reaches it (what preset:none renders to)', () => {
    expect(
      toolsetOfAgent(agent('grafana'), 'muster', [carrier('grafana', 'x')]),
    ).toEqual({ state: 'no-gateway' });
    expect(toolsetOfAgent(agent(), 'muster', [])).toEqual({
      state: 'no-gateway',
    });
  });

  // An unreadable carrier is not evidence of anything, least of all full access.
  it('leaves the toolset unresolved while the carrier cannot be read', () => {
    expect(toolsetOfAgent(agent('pr-reviewer'), 'muster', undefined)).toEqual({
      state: 'unresolved',
      carrier: 'pr-reviewer',
    });
    expect(toolsetOfAgent(agent('pr-reviewer'), 'muster', [])).toEqual({
      state: 'unresolved',
      carrier: 'pr-reviewer',
    });
    // A same-named server in another namespace is not the carrier.
    expect(
      toolsetOfAgent(agent('pr-reviewer'), 'muster', [
        carrier('pr-reviewer', 'preset:full', 'elsewhere'),
      ]),
    ).toEqual({ state: 'unresolved', carrier: 'pr-reviewer' });
  });

  it('prefers a declaring carrier over an unreadable one when several bindings reach the gateway', () => {
    expect(
      toolsetOfAgent(agent('muster', 'pr-reviewer'), 'muster', [
        carrier('pr-reviewer', 'preset:read-only'),
      ]),
    ).toEqual({
      state: 'declared',
      selectors: ['preset:read-only'],
      carrier: 'pr-reviewer',
    });
  });
});

describe('describeToolset', () => {
  it('summarises every state for a table cell', () => {
    expect(describeToolset(undefined)).toEqual({
      summary: '—',
      detail: 'carrier not read',
    });
    expect(describeToolset({ state: 'unresolved', carrier: 'a' })).toEqual({
      summary: '—',
      detail: 'a not readable',
    });
    expect(describeToolset({ state: 'no-gateway' })).toEqual({
      summary: 'No tools',
    });
    expect(describeToolset({ state: 'implicit-full', carrier: 'a' })).toEqual({
      summary: 'Full gateway access',
      detail: 'no toolset declared',
    });
    expect(
      describeToolset({ state: 'declared', selectors: ['preset:none'], carrier: 'a' }),
    ).toEqual({ summary: 'No tools', detail: 'preset:none' });
    expect(
      describeToolset({ state: 'declared', selectors: ['preset:full'], carrier: 'a' }),
    ).toEqual({ summary: 'Full gateway access', detail: 'preset:full' });
    expect(
      describeToolset({
        state: 'declared',
        selectors: ['preset:read-only', 'server:pro'],
        carrier: 'a',
      }),
    ).toEqual({ summary: 'preset:read-only, server:pro', detail: '2 selectors' });
  });
});

const SERVERS: ServerInfo[] = [
  {
    name: 'kubernetes-gazelle',
    family: 'kubernetes',
    group: 'infrastructure',
    toolNamePrefix: 'x_kubernetes',
    state: 'Connected',
    oauth: false,
  },
  {
    name: 'kubernetes-golem',
    family: 'kubernetes',
    group: 'infrastructure',
    toolNamePrefix: 'x_kubernetes',
    state: 'Failed',
    oauth: false,
  },
  {
    name: 'agent-manager',
    group: 'agent-platform',
    toolNamePrefix: 'x_agent-manager',
    state: 'Connected',
    oauth: false,
  },
  {
    name: 'pro',
    group: 'registered',
    toolNamePrefix: 'x_pro',
    state: 'Auth Required',
    oauth: true,
  },
];

function tool(name: string, extra: Partial<ToolSummary> = {}): ToolSummary {
  return { name, ...extra };
}

describe('serverOfTool', () => {
  it("prefers muster's server field, falling back to the longest prefix", () => {
    expect(serverOfTool(tool('anything', { server: 'pro' }), SERVERS)).toBe(
      'pro',
    );
    expect(serverOfTool(tool('x_kubernetes_get_pods'), SERVERS)).toBe(
      'kubernetes',
    );
    expect(serverOfTool(tool('x_agent-manager_create_agent'), SERVERS)).toBe(
      'agent-manager',
    );
    expect(serverOfTool(tool('x_unknown_thing'), SERVERS)).toBeUndefined();
  });
});

describe('buildCatalogue', () => {
  it('groups by the tool-group label, with core tools and workflows set apart', () => {
    const groups = buildCatalogue(
      [
        tool('x_kubernetes_get_pods', {
          server: 'kubernetes',
          kind: 'tool',
          annotations: { readOnlyHint: true },
        }),
        tool('x_agent-manager_create_agent', {
          server: 'agent-manager',
          kind: 'tool',
        }),
        tool('core_service_list', { kind: 'core' }),
        tool('workflow_incident-triage', { kind: 'workflow' }),
        tool('x_thirdparty_do', { server: 'thirdparty', kind: 'tool' }),
      ],
      SERVERS,
      ['pro'],
    );

    expect(groups.map(g => g.key)).toEqual([
      'infrastructure',
      'agent-platform',
      'registered',
      'workflows',
    ]);

    const [infra, platform, registered, workflows] = groups;
    expect(infra.servers.map(s => s.name)).toEqual(['kubernetes']);
    expect(infra.servers[0].isFamily).toBe(true);
    expect(infra.servers[0].tools.map(t => t.name)).toEqual([
      'x_kubernetes_get_pods',
    ]);
    // The family's worst member state is what the row reports.
    expect(infra.servers[0].state).toBe('Failed');

    expect(platform.servers.map(s => s.name)).toEqual(['agent-manager']);
    expect(platform.platformAdministration.map(t => t.name)).toEqual([
      'core_service_list',
    ]);

    // Every registered CR is listed even when its tools are not; a server
    // muster named without any CR is listed too.
    expect(registered.servers.map(s => s.name)).toEqual(['pro', 'thirdparty']);
    expect(registered.servers[0]).toMatchObject({
      needsSignIn: true,
      canSignIn: true,
      tools: [],
    });
    expect(registered.servers[1]).toMatchObject({
      unknownServer: true,
      needsSignIn: false,
    });

    expect(workflows.workflows.map(t => t.name)).toEqual([
      'workflow_incident-triage',
    ]);
  });

  it('attributes tools by prefix on an aggregator that reports no server field', () => {
    const groups = buildCatalogue(
      [tool('x_kubernetes_get_pods'), tool('core_service_list')],
      SERVERS,
      [],
    );
    expect(
      groups.find(g => g.key === 'infrastructure')?.servers[0].tools,
    ).toEqual([tool('x_kubernetes_get_pods')]);
    expect(
      groups.find(g => g.key === 'agent-platform')?.platformAdministration,
    ).toEqual([tool('core_service_list')]);
  });

  it('stops offering the sign-in once the session lists a server’s tools', () => {
    const groups = buildCatalogue(
      [tool('x_pro_list_boards', { server: 'pro' })],
      SERVERS,
      [],
    );
    const pro = groups
      .find(g => g.key === 'registered')
      ?.servers.find(s => s.name === 'pro');
    expect(pro?.needsSignIn).toBe(false);
    expect(pro?.tools).toHaveLength(1);
  });

  it('keeps a family member muster names in servers_requiring_auth on the family row, not as a server of its own', () => {
    const groups = buildCatalogue(
      [],
      [
        {
          name: 'kubernetes-lab-01',
          family: 'kubernetes',
          group: 'infrastructure',
          toolNamePrefix: 'x_kubernetes',
          state: 'Auth Required',
          oauth: true,
        },
        {
          name: 'kubernetes-lab-02',
          family: 'kubernetes',
          group: 'infrastructure',
          toolNamePrefix: 'x_kubernetes',
          state: 'Auth Required',
          oauth: true,
        },
      ],
      ['kubernetes-lab-01', 'kubernetes-lab-02', 'somewhere-else'],
    );
    expect(
      groups.map(group => [
        group.key,
        group.servers.map(bucket => [bucket.name, bucket.needsSignIn]),
      ]),
    ).toEqual([
      ['infrastructure', [['kubernetes', true]]],
      ['registered', [['somewhere-else', true]]],
    ]);
  });

  it('flags server: selectors whose server the caller cannot see', () => {
    const groups = buildCatalogue([], SERVERS, ['pro']);
    expect(
      unsignedServerSelectors(
        ['server:pro', 'server:kubernetes', 'tool:x_pro_x'],
        groups,
      ),
    ).toEqual(['server:pro']);
  });
});

describe('markers', () => {
  it('lets read-only win over the MCP default destructive hint', () => {
    // Live shape from agent-manager through muster 5.11.0: both hints true.
    expect(
      isDestructive({
        annotations: { readOnlyHint: true, destructiveHint: true },
      }),
    ).toBe(false);
    expect(isDestructive({ annotations: { destructiveHint: true } })).toBe(
      true,
    );
    expect(
      isReadOnly({
        annotations: { readOnlyHint: true, destructiveHint: true },
      }),
    ).toBe(true);
    expect(isDestructive({})).toBe(false);
  });
});

describe('selectorForTool', () => {
  it('uses workflow: for workflows and tool: for everything else', () => {
    expect(selectorForTool(tool('workflow_incident-triage'))).toBe(
      'workflow:incident-triage',
    );
    expect(selectorForTool(tool('run', { kind: 'workflow' }))).toBe(
      'workflow:run',
    );
    expect(selectorForTool(tool('x_kubernetes_get_pods'))).toBe(
      'tool:x_kubernetes_get_pods',
    );
    expect(selectorForTool(tool('core_service_list'))).toBe(
      'tool:core_service_list',
    );
  });
});

describe('muster answers', () => {
  it('tells an evaluated toolset from an ignored one by the echo', () => {
    expect(toolsetWasEvaluated({ toolset: ['preset:read-only'] })).toBe(true);
    expect(toolsetWasEvaluated({ toolset: [] })).toBe(true);
    expect(toolsetWasEvaluated({})).toBe(false);
  });

  it('recognises the unknown-preset refusal', () => {
    expect(
      isUnknownPresetError(
        'toolset [preset:foo] names unknown preset "foo"; known presets: read-only, none, full',
      ),
    ).toBe(true);
    expect(isUnknownPresetError('Muster request failed with status 503')).toBe(
      false,
    );
  });
});

describe('groupWorkflows', () => {
  const wf = (name: string): ToolSummary => ({
    name: `workflow_${name}`,
    kind: 'workflow',
  });

  it('leaves a short catalogue ungrouped', () => {
    expect(groupWorkflows(['a-1', 'a-2', 'b-1'].map(wf))).toBeUndefined();
    expect(groupWorkflows([])).toBeUndefined();
  });

  it('groups by the leading name segment, labels with the longest shared prefix, gathers singletons last', () => {
    const groups = groupWorkflows(
      [
        'mc-etcd-space-low',
        'mc-node-not-ready',
        'mc-api-down',
        'wc-pod-pending',
        'wc-node-taint',
        'cert-manager-down',
        'cert-manager-too-many-requests',
        'certificate-expiring',
        'kube-api-latency',
        'kube-controller-down',
        'kube_scheduler_down',
        'flux-helm-release-failed',
        'flux-kustomization-failed',
        'lonely-one',
        'another-single',
      ].map(wf),
    );
    expect(
      groups?.map(group => [
        group.key,
        group.label,
        group.workflows.map(entry => entry.name),
      ]),
    ).toEqual([
      [
        'cert',
        'cert-manager',
        [
          'workflow_cert-manager-down',
          'workflow_cert-manager-too-many-requests',
        ],
      ],
      [
        'flux',
        'flux',
        [
          'workflow_flux-helm-release-failed',
          'workflow_flux-kustomization-failed',
        ],
      ],
      [
        'kube',
        'kube',
        [
          'workflow_kube_scheduler_down',
          'workflow_kube-api-latency',
          'workflow_kube-controller-down',
        ],
      ],
      [
        'mc',
        'mc',
        [
          'workflow_mc-api-down',
          'workflow_mc-etcd-space-low',
          'workflow_mc-node-not-ready',
        ],
      ],
      ['wc', 'wc', ['workflow_wc-node-taint', 'workflow_wc-pod-pending']],
      [
        OTHER_WORKFLOWS_KEY,
        'Other workflows',
        [
          'workflow_another-single',
          'workflow_certificate-expiring',
          'workflow_lonely-one',
        ],
      ],
    ]);
  });
});

describe('catalogueInventory', () => {
  it('counts servers, their tools, core tools and workflows across the groups', () => {
    const groups = buildCatalogue(
      [
        { name: 'x_kubernetes_get_pods', server: 'kubernetes', kind: 'tool' },
        { name: 'x_kubernetes_get_nodes', server: 'kubernetes', kind: 'tool' },
        { name: 'core_service_list', kind: 'core' },
        { name: 'workflow_triage', kind: 'workflow' },
      ],
      [
        {
          name: 'kubernetes-a',
          family: 'kubernetes',
          group: 'infrastructure',
          toolNamePrefix: 'x_kubernetes',
          oauth: false,
        },
        {
          name: 'pro',
          group: 'registered',
          toolNamePrefix: 'x_pro',
          state: 'Auth Required',
          oauth: true,
        },
      ],
      ['pro'],
    );
    expect(catalogueInventory(groups)).toEqual({
      servers: 2,
      tools: 2,
      platformAdministration: 1,
      workflows: 1,
    });
    expect(countNoun(1, 'tool')).toBe('1 tool');
    expect(countNoun(2, 'tool')).toBe('2 tools');
  });
});
