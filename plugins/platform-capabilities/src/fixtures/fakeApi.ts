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
  features: [
    {
      id: 'identity',
      title: 'Identity',
      description: 'Dex clients and the sign-in chain.',
      dimensions: [
        { id: 'dex-clients', kind: 'dex-secret', key: 'staticClients' },
        { id: 'dex-auth-request', kind: 'probe', key: 'Dex /auth 302' },
        { id: 'live-dex-auth-per-client', kind: 'live', key: 'Dex /auth' },
      ],
    },
    {
      id: 'secrets',
      title: 'Secrets',
      dimensions: [
        { id: 'other-secret-shapes', kind: 'extras', key: 'secrets/' },
      ],
    },
    {
      id: 'runtime',
      title: 'Runtime',
      dimensions: [
        { id: 'patch-top-level-keys', kind: 'configmap', key: 'top-level' },
        { id: 'live-drift', kind: 'live', key: 'live values' },
      ],
    },
    {
      id: 'tool-access',
      title: 'Tool access',
      dimensions: [
        {
          id: 'muster-protected-resource-metadata',
          kind: 'probe',
          key: 'oauth-protected-resource',
        },
      ],
    },
    {
      id: 'federation',
      title: 'Federation and tunnels',
      dimensions: [
        { id: 'federation-targets', kind: 'extras', key: 'tunnels' },
      ],
    },
    {
      id: 'portal',
      title: 'Portal section',
      dimensions: [
        { id: 'portal-extra-files', kind: 'backstage', key: 'portal' },
      ],
    },
  ],
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

const AUTHORITY_REASON =
  "needs the person's authority on the installation: the live comparison comes with the read-side shape";

/**
 * rowan verified: the three marks across the definition's six features, a
 * live dimension the manager does not check yet, a feature that renders no
 * file.
 */
export const VERIFIED: VerifyResult = {
  installation: 'rowan',
  capability: 'agent-platform',
  state: 'drifted',
  inputs: {
    source: 'action enable-agent-platform-rowan-1',
    values: { installation: RECORD, kagent: { enabled: true } },
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
    'as defined': 3,
    'differs by input': 1,
    drifted: 1,
    'not checked': 1,
  },
};

/**
 * alder verified as someone whose probes the manager ran anyway: the
 * anonymous probe of the identity feature answered 403, the tool-access
 * feature has nothing but that kind of dimension. The view shows neither as
 * drift to a person who may not read the installation.
 */
export const PROBES_DRIFTED: VerifyResult = {
  installation: 'alder',
  capability: 'agent-platform',
  state: 'drifted',
  inputs: { source: 'none' },
  features: [
    {
      id: 'identity',
      title: 'Identity',
      mark: 'drifted',
      dimensions: [
        { id: 'dex-clients', kind: 'dex-secret', mark: 'as defined' },
        {
          id: 'dex-auth-request',
          kind: 'probe',
          mark: 'drifted',
          probe: {
            expect: [302],
            requests: [
              {
                url: 'https://dex.alder.example.test/auth?client_id=kagent',
                status: 403,
                ok: false,
              },
            ],
          },
        },
      ],
    },
    {
      id: 'tool-access',
      title: 'Tool access',
      mark: 'drifted',
      dimensions: [
        {
          id: 'muster-protected-resource-metadata',
          kind: 'probe',
          mark: 'drifted',
        },
      ],
    },
    {
      id: 'runtime',
      title: 'Runtime',
      mark: 'as defined',
      dimensions: [
        { id: 'patch-top-level-keys', kind: 'configmap', mark: 'as defined' },
      ],
    },
  ],
  summary: { drifted: 2, 'as defined': 1 },
};

export interface FakeOptions {
  installations?: Installation[];
  definitions?: Definition[];
  connection?: ConnectionResponse;
  plan?: CapabilityPlan;
  committed?: Committed;
  actions?: Action[];
  /** One answer for every installation, or one per installation. */
  verified?: VerifyResult | ((installation: string) => VerifyResult);
  /** Installations whose verify fails, with the error. */
  verifyErrors?: Record<string, Error>;
  /** Installations of the registry the person cannot read. */
  unreadable?: string[];
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
  /** The installations verified, in order. */
  verifiedInstallations: string[] = [];

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
      unreadable: this.options.unreadable ?? [],
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

  async verifyCapability(name: string): Promise<VerifyResult> {
    this.verified++;
    this.verifiedInstallations.push(name);
    const failure = this.options.verifyErrors?.[name];
    if (failure) {
      throw failure;
    }
    const { verified } = this.options;
    if (typeof verified === 'function') {
      return verified(name);
    }
    return verified ?? { ...VERIFIED, installation: name };
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
