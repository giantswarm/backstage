import {
  Action,
  ActionListing,
  CapabilityPlan,
  CapabilityArgs,
  Committed,
  ConnectionResponse,
  Definition,
  Installation,
  InstallationListing,
  VerifyFeature,
  ListInstallationsFilters,
  ManagerInfo,
  PlatformCapabilitiesApi,
  VerifyResult,
  WriteOptions,
  WriteResult,
} from '../apis';

/** The agent-platform definition's input schema, in the shape `get_info` publishes it. */
export const AGENT_PLATFORM_DEFINITION: Definition = {
  name: 'agent-platform',
  description: 'The agent platform on an installation.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['kagent', 'portal'],
    properties: {
      installation: {
        type: 'object',
        description: 'The installation, from its record.',
        properties: {
          name: { type: 'string' },
          baseDomain: { type: 'string' },
          private: { type: 'boolean' },
          chartLine: { type: 'string', enum: ['3', '4'] },
        },
      },
      kagent: {
        type: 'object',
        required: ['enabled'],
        properties: {
          enabled: { type: 'boolean', description: 'Run kagent.' },
        },
      },
      portal: {
        type: 'object',
        required: ['enabled'],
        properties: { enabled: { type: 'boolean' } },
      },
      federation: {
        type: 'object',
        properties: {
          targets: { type: 'array', items: { type: 'string' } },
        },
      },
      modelServing: {
        type: 'object',
        description: 'The one choice: whether the installation serves models.',
        properties: {
          enabled: { type: 'boolean', default: false, 'x-source': 'person' },
        },
      },
    },
  },
};

export const RECORD = {
  name: 'rowan',
  baseDomain: 'rowan.example.test',
  customer: 'example',
  provider: 'capa',
  private: false,
  chartLine: '4',
};

export function installation(
  overrides: Partial<Installation> = {},
): Installation {
  return {
    name: 'rowan',
    customer: 'example',
    provider: 'capa',
    pipeline: 'testing',
    region: 'eu-west-1',
    record: RECORD,
    optIn: {
      state: 'opted in',
      repository: 'example/example-management-clusters',
      path: 'management-clusters/rowan/platform-manager.yaml',
      present: true,
      optIn: true,
    },
    capabilities: [
      {
        name: 'agent-platform',
        state: 'not enabled',
        inputs: { installation: RECORD },
        enabled: false,
        lastAction: null,
      },
    ],
    readable: true,
    ...overrides,
  };
}

export const NOT_OPTED_IN: Installation = installation({
  name: 'alder',
  record: { ...RECORD, name: 'alder', baseDomain: 'alder.example.test' },
  optIn: {
    state: 'not opted in',
    repository: 'example/example-management-clusters',
    path: 'management-clusters/alder/platform-manager.yaml',
    present: false,
    howToOptIn: 'https://github.com/example/example-management-clusters/pull/1',
  },
  capabilities: [
    {
      name: 'agent-platform',
      state: 'not opted in',
      inputs: {
        installation: { ...RECORD, name: 'alder' },
      },
      enabled: false,
      lastAction: null,
    },
  ],
});

/** An installation of the fixture set with the capability in one state. */
function withState(
  name: string,
  capability: Installation['capabilities'][number],
): Installation {
  return installation({
    name,
    record: { ...RECORD, name, baseDomain: `${name}.example.test` },
    capabilities: [
      { ...capability, inputs: { installation: { ...RECORD, name } } },
    ],
  });
}

/** Enabled through the manager: its last action rolled out and verified. */
export const ENABLED: Installation = withState('birch', {
  name: 'agent-platform',
  state: 'enabled',
  enabled: true,
  lastAction: { name: 'enable-agent-platform-birch-1', result: 'enabled' },
});

/** Enabled before the manager existed: the fileset is on record, no action is. */
export const ENABLED_BY_HAND: Installation = withState('cedar', {
  name: 'agent-platform',
  state: 'enabled',
  enabled: true,
  lastAction: null,
});

/** The last verify found it off its definition. */
export const DRIFTED: Installation = withState('elm', {
  name: 'agent-platform',
  state: 'drifted',
  enabled: true,
  lastAction: { name: 'reconcile-agent-platform-elm-3', result: 'drifted' },
});

/** The pull requests are merged and the rollout runs. */
export const ROLLING_OUT: Installation = withState('fir', {
  name: 'agent-platform',
  state: 'rolling out',
  enabled: true,
  lastAction: { name: 'enable-agent-platform-fir-1', result: 'rolling out' },
});

/** The rollout's probe went red. */
export const FAILED: Installation = withState('hazel', {
  name: 'agent-platform',
  state: 'failed',
  enabled: true,
  lastAction: { name: 'reconcile-agent-platform-hazel-2', result: 'failed' },
});

export const PLAN: CapabilityPlan = {
  tool: 'enable_capability',
  capability: 'agent-platform',
  hub: 'hazel',
  dryRun: true,
  order: ['rowan'],
  installations: [
    {
      name: 'rowan',
      state: 'not enabled',
      files: [
        {
          repository: 'example/example-configs',
          path: 'installations/rowan/apps/agent-platform/configmap-values.yaml.patch',
          change: 'create',
        },
        {
          repository: 'example/example-management-clusters',
          path: 'management-clusters/rowan/extras/dex/secret.yaml',
          change: 'create',
          generated: ['dex-client-kagent'],
        },
      ],
      generatedSecrets: [
        { name: 'dex-client-kagent', kind: 'client secret', length: 32 },
      ],
      dexClients: [
        {
          id: 'kagent',
          name: 'kagent',
          secret: 'dex-client-kagent',
          redirectURIs: ['https://kagent.rowan.example.test/oauth2/callback'],
        },
      ],
      customerActions: [
        {
          installation: 'rowan',
          action: 'Provide the model API key',
          why: 'kagent.additionalModelConfigs names apiKeySecret',
        },
      ],
      probes: [{ id: 'dex-auth-request', feature: 'sso' }],
      diff: { create: 2 },
    },
  ],
  pullRequests: [
    {
      order: 1,
      repository: 'example/example-configs',
      installations: ['rowan'],
      files: [
        'installations/rowan/apps/agent-platform/configmap-values.yaml.patch',
      ],
      changes: 1,
    },
    {
      order: 2,
      repository: 'example/example-management-clusters',
      installations: ['rowan'],
      files: ['management-clusters/rowan/extras/dex/secret.yaml'],
      changes: 1,
      generatedSecrets: ['dex-client-kagent'],
    },
  ],
  skipped: [],
  commit:
    'Commit opens the pull requests in order and asks the team for approval.',
};

export const ACTION: Action = {
  name: 'enable-agent-platform-rowan-1',
  createdAt: '2026-09-18T10:00:00Z',
  spec: {
    actor: { login: 'someone' },
    capability: 'agent-platform',
    kind: 'enable',
    installations: ['rowan'],
  },
  status: {
    state: 'pending approval',
    pullRequests: [
      {
        repository: 'example/example-configs',
        number: 7,
        url: 'https://github.com/example/example-configs/pull/7',
        state: 'open',
      },
    ],
    approval: { channel: '#platform', decision: 'pending' },
  },
};

const AUTHORITY_REASON = 'needs your session on the installation';

/**
 * rowan compared with its definition: the four marks across the definition's
 * six features, two live dimensions that need the person's session, a feature
 * that renders no file; and the plan the same inputs render.
 */
export const VERIFIED: VerifyResult = {
  installation: 'rowan',
  capability: 'agent-platform',
  state: 'drifted',
  inputs: {
    source: 'record + read-back',
    values: {
      installation: RECORD,
      kagent: { enabled: true },
      modelServing: { enabled: false },
    },
  },
  features: [
    {
      id: 'identity',
      title: 'Identity',
      mark: 'as defined',
      dimensions: [
        { id: 'dex-clients', kind: 'dex-secret', mark: 'as defined' },
        {
          id: 'dex-auth-request',
          kind: 'probe',
          mark: 'as defined',
          probe: {
            expect: [302],
            requests: [
              {
                url: 'https://dex.rowan.example.test/auth?client_id=kagent',
                status: 302,
                ok: true,
              },
            ],
          },
        },
        {
          id: 'live-dex-auth-per-client',
          kind: 'live',
          mark: 'not checked',
          reason: AUTHORITY_REASON,
        },
      ],
    },
    {
      id: 'secrets',
      title: 'Secrets',
      mark: 'differs by input',
      dimensions: [
        {
          id: 'other-secret-shapes',
          kind: 'extras',
          mark: 'differs by input',
          differences: [
            {
              file: 'example/example-management-clusters:management-clusters/rowan/extras/agent-platform/secrets/kustomization.yaml',
              path: 'resources',
              input: 'installation.private',
              rendered: ['a.yaml'],
              current: ['a.yaml', 'b.yaml'],
            },
          ],
        },
      ],
    },
    {
      id: 'runtime',
      title: 'Runtime',
      mark: 'drifted',
      dimensions: [
        {
          id: 'patch-top-level-keys',
          kind: 'configmap',
          mark: 'drifted',
          differences: [
            {
              file: 'example/example-configs:installations/rowan/apps/agent-platform/configmap-values.yaml.patch',
              path: 'kagent.replicas',
              rendered: 1,
              current: 2,
            },
          ],
        },
        {
          id: 'live-drift',
          kind: 'live',
          mark: 'not checked',
          reason: AUTHORITY_REASON,
        },
      ],
    },
    {
      id: 'tool-access',
      title: 'Tool access',
      mark: 'as defined',
      dimensions: [
        {
          id: 'muster-protected-resource-metadata',
          kind: 'probe',
          mark: 'as defined',
        },
      ],
    },
    {
      id: 'federation',
      title: 'Federation and tunnels',
      mark: 'not checked',
      dimensions: [
        {
          id: 'federation-targets',
          kind: 'extras',
          mark: 'not checked',
          reason: 'renders no file of this kind',
        },
      ],
    },
    {
      id: 'portal',
      title: 'Portal section',
      mark: 'as defined',
      dimensions: [
        { id: 'portal-extra-files', kind: 'backstage', mark: 'as defined' },
      ],
    },
  ],
  summary: {
    'as defined': 4,
    'differs by input': 1,
    drifted: 1,
    'not checked': 3,
  },
  files: PLAN.installations[0].files,
  generatedSecrets: PLAN.installations[0].generatedSecrets,
  dexClients: PLAN.installations[0].dexClients,
  customerActions: PLAN.installations[0].customerActions,
  diff: PLAN.installations[0].diff,
  pullRequests: PLAN.pullRequests,
};

/** The runtime feature with the change a migration plans, not drift. */
const PLANNED_RUNTIME: VerifyFeature = {
  id: 'runtime',
  title: 'Runtime',
  mark: 'planned',
  marks: { planned: 1 },
  dimensions: [
    {
      id: 'patch-top-level-keys',
      kind: 'configmap',
      mark: 'planned',
      differences: [
        {
          file: 'example/example-configs:installations/rowan/apps/agent-platform/configmap-values.yaml.patch',
          path: 'kagent.apiVersion',
          planned: 'migrates to kagent API v2 with the 4 chart line',
          rendered: 'v2',
          current: 'v1',
        },
      ],
    },
  ],
};

/** rowan as defined: no difference, nothing to change. */
export const UP_TO_DATE: VerifyResult = {
  ...VERIFIED,
  state: 'enabled',
  features: VERIFIED.features.filter(f => f.mark === 'as defined'),
  summary: { 'as defined': 4 },
  files: [],
  diff: { unchanged: 2 },
  pullRequests: [],
};

/** rowan as defined but for one planned change: the pull request a migration opens. */
export const PLANNED: VerifyResult = {
  ...UP_TO_DATE,
  features: [...UP_TO_DATE.features, PLANNED_RUNTIME],
  summary: { 'as defined': 4, planned: 1 },
  files: [{ ...PLAN.installations[0].files![0], change: 'update' }],
  diff: { update: 1, unchanged: 1 },
  pullRequests: [PLAN.pullRequests![0]],
};

/** rowan with differences and a planned change, one feature carrying both. */
export const MIXED: VerifyResult = {
  ...VERIFIED,
  features: [
    ...VERIFIED.features,
    {
      id: 'migrations',
      title: 'Migrations',
      mark: 'drifted',
      marks: { drifted: 1, planned: 1 },
      dimensions: [
        {
          id: 'chart-line',
          kind: 'configmap',
          mark: 'drifted',
          differences: [
            {
              file: 'example/example-configs:installations/rowan/apps/agent-platform/configmap-values.yaml.patch',
              path: 'chartLine',
              rendered: '4',
              current: '3',
            },
          ],
        },
        { ...PLANNED_RUNTIME.dimensions![0], id: 'kagent-api-version' },
      ],
    },
  ],
  summary: { ...VERIFIED.summary, drifted: 2, planned: 1 },
};

/**
 * rowan not compared: the record failed the definition's schema, so the
 * manager refused and checked nothing -- every dimension not checked.
 */
export const NOT_COMPARED: VerifyResult = {
  ...VERIFIED,
  state: 'enabled',
  refused:
    'installation.podCertificateRequest: the record does not say whether the cluster serves PodCertificateRequest',
  features: VERIFIED.features.map(f => ({
    ...f,
    mark: 'not checked',
    marks: undefined,
    dimensions: f.dimensions?.map(d =>
      d.mark === 'not checked'
        ? d
        : {
            id: d.id,
            kind: d.kind,
            mark: 'not checked' as const,
            reason: 'the record failed the schema',
          },
    ),
  })),
  summary: { 'not checked': 9 },
  files: [],
  diff: {},
  pullRequests: [],
};

export interface FakeOptions {
  installations?: Installation[];
  definitions?: Definition[];
  connection?: ConnectionResponse;
  plan?: CapabilityPlan;
  committed?: Committed;
  actions?: Action[];
  verified?: VerifyResult;
  /** Installations of the registry the person cannot read. */
  unreadable?: string[];
  /** How long the listing takes, in milliseconds: the manager reads a fleet. */
  latency?: number;
  /** The comparison fails with this, as when the person has no session at the manager. */
  verifyError?: Error;
}

export interface Write {
  tool: 'enable_capability' | 'reconcile_capability';
  installation: string;
  capability: string;
  args: CapabilityArgs;
  options: WriteOptions;
}

/** An in-memory manager for tests: answers from the fixtures, records the writes. */
export class FakeApi implements PlatformCapabilitiesApi {
  writes: Write[] = [];
  listFilters: ListInstallationsFilters[] = [];
  /** Every comparison asked for, with its arguments. */
  verifies: {
    installation: string;
    capability: string;
    args?: CapabilityArgs;
  }[] = [];

  constructor(private readonly options: FakeOptions = {}) {}

  async getConnection(): Promise<ConnectionResponse> {
    return this.options.connection ?? { connected: true };
  }

  async getInfo(): Promise<ManagerInfo> {
    return {
      version: '0.7.0',
      definitions: this.options.definitions ?? [AGENT_PLATFORM_DEFINITION],
      capabilities: {
        commit: true,
        modes: ['commit'],
        writeTools: ['enable_capability', 'reconcile_capability'],
      },
    };
  }

  async listInstallations(
    filters: ListInstallationsFilters = {},
  ): Promise<InstallationListing> {
    this.listFilters.push(filters);
    if (this.options.latency) {
      await new Promise(resolve => setTimeout(resolve, this.options.latency));
    }
    const all = this.options.installations ?? [installation()];
    const installations = filters.installations
      ? all.filter(i => filters.installations!.includes(i.name))
      : all;
    return {
      hub: 'hazel',
      capabilities: (
        this.options.definitions ?? [AGENT_PLATFORM_DEFINITION]
      ).map(d => d.name),
      installations,
      unreadable: this.options.unreadable ?? [],
    };
  }

  enableCapability<O extends WriteOptions>(
    name: string,
    capability: string,
    args: CapabilityArgs,
    options: O,
  ): Promise<WriteResult<O>> {
    return this.write('enable_capability', name, capability, args, options);
  }

  reconcileCapability<O extends WriteOptions>(
    name: string,
    capability: string,
    args: CapabilityArgs,
    options: O,
  ): Promise<WriteResult<O>> {
    return this.write('reconcile_capability', name, capability, args, options);
  }

  async verifyCapability(
    name: string,
    capability: string,
    args?: CapabilityArgs,
  ): Promise<VerifyResult> {
    this.verifies.push({ installation: name, capability, args });
    if (this.options.verifyError) {
      throw this.options.verifyError;
    }
    return {
      ...(this.options.verified ?? VERIFIED),
      installation: name,
      capability,
    };
  }

  async listActions(): Promise<ActionListing> {
    return { actions: this.options.actions ?? [] };
  }

  async getAction(name: string): Promise<Action> {
    const found = (this.options.actions ?? []).find(a => a.name === name);
    if (!found) {
      throw new Error(`no action ${name}`);
    }
    return found;
  }

  private async write<O extends WriteOptions>(
    tool: Write['tool'],
    name: string,
    capability: string,
    args: CapabilityArgs,
    options: O,
  ): Promise<WriteResult<O>> {
    this.writes.push({ tool, installation: name, capability, args, options });
    if ('dryRun' in options) {
      const plan = this.options.plan ?? PLAN;
      return {
        ...plan,
        installations: plan.installations.map(i => ({ ...i, name })),
      } as WriteResult<O>;
    }
    return (this.options.committed ?? {
      action: ACTION,
      message: 'Action started.',
    }) as WriteResult<O>;
  }
}
