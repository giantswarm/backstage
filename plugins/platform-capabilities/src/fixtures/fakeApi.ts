import {
  Action,
  ActionListing,
  CapabilityPlan,
  CapabilityWriteArgs,
  Committed,
  ConnectionResponse,
  Definition,
  Installation,
  InstallationListing,
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

export const VERIFIED: VerifyResult = {
  installation: 'rowan',
  capability: 'agent-platform',
  state: 'drifted',
  inputs: { source: 'action enable-agent-platform-rowan-1' },
  features: [
    { id: 'sso', title: 'Single sign-on', mark: 'as defined', dimensions: [] },
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
      ],
    },
  ],
  summary: { 'as defined': 1, drifted: 1 },
};

export interface FakeOptions {
  installations?: Installation[];
  definitions?: Definition[];
  connection?: ConnectionResponse;
  plan?: CapabilityPlan;
  committed?: Committed;
  actions?: Action[];
  verified?: VerifyResult;
}

export interface Write {
  tool: 'enable_capability' | 'reconcile_capability';
  installation: string;
  capability: string;
  args: CapabilityWriteArgs;
  options: WriteOptions;
}

/** An in-memory manager for tests: answers from the fixtures, records the writes. */
export class FakeApi implements PlatformCapabilitiesApi {
  writes: Write[] = [];
  listFilters: ListInstallationsFilters[] = [];
  verified = 0;

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
    const all = this.options.installations ?? [installation()];
    const installations = filters.installations
      ? all.filter(i => filters.installations!.includes(i.name))
      : all;
    return {
      hub: 'hazel',
      capabilities: ['agent-platform'],
      installations,
      unreadable: [],
    };
  }

  enableCapability<O extends WriteOptions>(
    name: string,
    capability: string,
    args: CapabilityWriteArgs,
    options: O,
  ): Promise<WriteResult<O>> {
    return this.write('enable_capability', name, capability, args, options);
  }

  reconcileCapability<O extends WriteOptions>(
    name: string,
    capability: string,
    args: CapabilityWriteArgs,
    options: O,
  ): Promise<WriteResult<O>> {
    return this.write('reconcile_capability', name, capability, args, options);
  }

  async verifyCapability(): Promise<VerifyResult> {
    this.verified++;
    return this.options.verified ?? VERIFIED;
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
    args: CapabilityWriteArgs,
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
