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
  VerifyDimension,
  VerifyFeature,
  VerifyInputs,
  VerifyMark,
  ListInstallationsFilters,
  ManagerInfo,
  PlanFile,
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

/** A second installation with nothing on record. */
export const NOT_ENABLED: Installation = installation({
  name: 'alder',
  record: { ...RECORD, name: 'alder', baseDomain: 'alder.example.test' },
  capabilities: [
    {
      name: 'agent-platform',
      state: 'not enabled',
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
      {
        ...capability,
        inputs: { installation: { ...RECORD, name } },
      },
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

/** The configmap patch as the definition renders it. */
export const PATCH_RENDERED = [
  'kagent:',
  '  apiVersion: v2',
  '  replicas: 1',
  '  image:',
  '    tag: 1.2.3',
  '  resources:',
  '    limits:',
  '      memory: 512Mi',
  'chartLine: "4"',
  'portal:',
  '  enabled: true',
  '  baseUrl: https://portal.rowan.example.test',
  '  title: Rowan',
  'federation:',
  '  targets: []',
  '',
].join('\n');

/** The patch on record: replicas and the chart line hand-edited, the kagent API still v1. */
export const PATCH_ON_RECORD = PATCH_RENDERED.replace(
  'apiVersion: v2',
  'apiVersion: v1',
)
  .replace('replicas: 1', 'replicas: 2')
  .replace('chartLine: "4"', 'chartLine: "3"');

/** The patch file of the comparison, to update, with the render and the record. */
export function patchFile(current: string): PlanFile {
  return {
    ...PLAN.installations[0].files![0],
    change: 'update',
    content: PATCH_RENDERED,
    current,
  };
}

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
              line: 3,
              currentLine: 3,
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
  files: [patchFile(PATCH_ON_RECORD), PLAN.installations[0].files![1]],
  generatedSecrets: PLAN.installations[0].generatedSecrets,
  dexClients: PLAN.installations[0].dexClients,
  customerActions: PLAN.installations[0].customerActions,
  diff: { update: 1, create: 1 },
  pullRequests: PLAN.pullRequests,
};

/** The live half's mark on a feature: its word on the one live dimension it checked, else nothing checked. */
function liveMarkOf(feature: VerifyFeature): VerifyMark {
  if (feature.dimensions?.some(d => d.id === 'live-drift')) {
    return 'drifted';
  }
  if (feature.dimensions?.some(d => d.id === 'live-dex-auth-per-client')) {
    return 'as defined';
  }
  return 'not checked';
}

/** The reason the live half gives every dimension the repository half checks. */
const REPOSITORY_SIDE =
  'compared against the repositories by verify_capability';

/**
 * rowan's live half (`verify_installation`), read as the person: the two
 * dimensions that needed the session checked -- the Dex clients answer as
 * defined, the live values drift on one leaf -- and every other dimension
 * left to the repository half.
 */
export const LIVE: VerifyResult = {
  installation: 'rowan',
  capability: 'agent-platform',
  caller: 'ada@example.test',
  state: 'drifted',
  inputs: VERIFIED.inputs,
  features: VERIFIED.features.map((f): VerifyFeature => ({
    id: f.id,
    title: f.title,
    mark: liveMarkOf(f),
    dimensions: (f.dimensions ?? []).map((d): VerifyDimension => {
      if (d.id === 'live-dex-auth-per-client') {
        return {
          id: d.id,
          kind: 'live',
          mark: 'as defined',
          live: {
            checks: [
              {
                kind: 'HTTP',
                url: 'https://dex.rowan.example.test/auth?client_id=kagent',
                mark: 'as defined',
                message: '302',
              },
            ],
          },
        };
      }
      if (d.id === 'live-drift') {
        return {
          id: d.id,
          kind: 'live',
          mark: 'drifted',
          differences: [
            {
              object: 'HelmRelease flux-giantswarm/agent-platform',
              path: 'kagent.replicas',
              rendered: 1,
              current: 2,
            },
          ],
          live: {
            checks: [
              {
                kind: 'Drift',
                namespace: 'flux-giantswarm',
                resource: 'HelmRelease',
                name: 'agent-platform',
                mark: 'drifted',
                message: '1 difference(s)',
              },
            ],
          },
        };
      }
      return {
        id: d.id,
        kind: d.kind,
        mark: 'not checked',
        reason: REPOSITORY_SIDE,
      };
    }),
  })),
  summary: { 'as defined': 1, drifted: 1, 'not checked': 7 },
  files: [],
  diff: {},
  pullRequests: [],
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
          planned:
            'The kagent API moves to v2 with the 4 chart line; the migration rewrites the patch. · M3',
          rendered: 'v2',
          current: 'v1',
          line: 2,
          currentLine: 2,
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
  files: [
    patchFile(PATCH_RENDERED.replace('apiVersion: v2', 'apiVersion: v1')),
  ],
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
              line: 9,
              currentLine: 9,
            },
          ],
        },
        { ...PLANNED_RUNTIME.dimensions![0], id: 'kagent-api-version' },
      ],
    },
  ],
  summary: { ...VERIFIED.summary, drifted: 2, planned: 1 },
};

/** The patch's file, `<repository>:<path>`, as a difference names it. */
const PATCH_FILE = `${PLAN.installations[0].files![0].repository}:${
  PLAN.installations[0].files![0].path
}`;

/**
 * The patch as the definition renders it after a rewrite: a header
 * comment, the components block new, kagent's replicas one.
 */
export const REWRITE_RENDERED = [
  '# Rendered by the platform manager for rowan.',
  'components:',
  '  kagent:',
  '    enabled: true',
  '  postgres:',
  '    enabled: true',
  'kagent:',
  '  replicas: 1',
  'llmRouting:',
  '  enabled: true',
  '',
].join('\n');

/**
 * The same patch as its owners wrote it by hand, read back with SOPS's
 * four-space indentation: comment blocks, a gateway block the definition
 * no longer renders (its `enabled: true` the same text as the components'),
 * two replicas.
 */
export const REWRITE_ON_RECORD = [
  '# Agent platform values for rowan.',
  '# Edited by hand.',
  'gateway:',
  '    jwksEgress:',
  '        enabled: true',
  '',
  '# kagent runs two replicas.',
  'kagent:',
  '    replicas: 2',
  'llmRouting:',
  '    # Routing stays on for the agents.',
  '    # Do not turn this off.',
  '    enabled: true',
  '',
].join('\n');

/**
 * rowan's patch rewritten by the definition: one check differs (the
 * replicas), one carries the planned changes (the components block added,
 * the gateway block removed).
 */
export const REWRITTEN: VerifyResult = {
  ...UP_TO_DATE,
  state: 'drifted',
  features: [
    ...UP_TO_DATE.features,
    {
      id: 'runtime',
      title: 'Runtime',
      mark: 'drifted',
      marks: { drifted: 1, planned: 1 },
      dimensions: [
        {
          id: 'patch-top-level-keys',
          kind: 'configmap',
          mark: 'drifted',
          differences: [
            {
              file: PATCH_FILE,
              path: 'kagent.replicas',
              rendered: 1,
              current: 2,
              line: 8,
              currentLine: 9,
            },
          ],
        },
        {
          id: 'patch-components',
          kind: 'configmap',
          mark: 'planned',
          differences: [
            {
              file: PATCH_FILE,
              path: 'components.kagent.enabled',
              planned:
                'Added: components.kagent.enabled is written explicitly with the value this installation gets · M7',
              rendered: true,
              line: 4,
            },
            {
              file: PATCH_FILE,
              path: 'components.postgres.enabled',
              planned:
                'Added: postgres.enabled is written explicitly (on where kagent runs) · M7',
              rendered: true,
              line: 6,
            },
            {
              file: PATCH_FILE,
              path: 'gateway.jwksEgress.enabled',
              planned:
                'Removed: gateway.jwksEgress is the shared default here · M8',
              current: true,
              currentLine: 5,
            },
          ],
        },
      ],
    },
  ],
  summary: { 'as defined': 3, drifted: 1, planned: 1 },
  files: [
    {
      ...PLAN.installations[0].files![0],
      change: 'update',
      content: REWRITE_RENDERED,
      current: REWRITE_ON_RECORD,
    },
  ],
  diff: { update: 1, unchanged: 1 },
  pullRequests: [PLAN.pullRequests![0]],
};

/** The hub's file rowan's portal section lives in: hazel's Backstage serves rowan. */
export const HUB_PORTAL_FILE =
  'example/example-management-clusters:management-clusters/hazel/extras/backstage/agent-platform/kustomization.yaml';

const MOVED =
  "Moved: the portal's Agent Platform settings leave the main app-config for a kustomize Component the platform owns · M3";

/**
 * rowan with planned changes only, one feature of them on its hub hazel:
 * the portal's component moves into a kustomization of hazel's Backstage.
 */
export const PLANNED_ON_HUB: VerifyResult = {
  ...PLANNED,
  hub: 'hazel',
  features: [
    ...PLANNED.features.filter(f => f.id !== 'portal'),
    {
      id: 'portal',
      title: 'Portal section',
      mark: 'planned',
      marks: { planned: 1 },
      dimensions: [
        {
          id: 'portal-extra-files',
          kind: 'backstage',
          mark: 'planned',
          differences: [
            {
              file: HUB_PORTAL_FILE,
              path: 'resources[app-config.yaml]',
              planned: MOVED,
              rendered: 'app-config.yaml',
            },
            {
              file: HUB_PORTAL_FILE,
              path: 'resources[values.yaml]',
              planned: MOVED,
              rendered: 'values.yaml',
            },
          ],
        },
      ],
    },
  ],
  summary: { 'as defined': 3, planned: 2 },
  files: [
    ...PLANNED.files!,
    {
      repository: 'example/example-management-clusters',
      path: 'management-clusters/hazel/extras/backstage/agent-platform/kustomization.yaml',
      change: 'create',
    },
  ],
  diff: { update: 1, create: 1, unchanged: 1 },
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

/**
 * The comparison ran and found the differences, and the manager would
 * refuse to commit them: a file on record needs a change first.
 */
export const COMMIT_REFUSED: VerifyResult = {
  ...VERIFIED,
  commitRefused:
    'dex-app 2.2.3 on record (example/example-management-cluster-bases:bases/collections/shared/base/dex-app.yaml): the referenced Dex client secrets need dex-app 3.2.2 or later; pin it in management-clusters/birch/collections/kustomization.yaml first',
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
  /** How long `get_info` takes, in milliseconds: the backend, muster and the manager answer in turn. */
  infoLatency?: number;
  /** The comparison fails with this, as when the person has no session at the manager. */
  verifyError?: Error;
  /** The live half `verify_installation` answers; LIVE by default. */
  live?: VerifyResult;
  /** The live checks fail with this, as when the person is not connected to the live surface. */
  liveError?: Error;
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
  /** Every live verify asked for, with the inputs handed over. */
  liveVerifies: {
    installation: string;
    capability: string;
    args?: { inputs?: VerifyInputs };
  }[] = [];

  constructor(private readonly options: FakeOptions = {}) {}

  async getConnection(): Promise<ConnectionResponse> {
    return this.options.connection ?? { connected: true };
  }

  async getInfo(): Promise<ManagerInfo> {
    if (this.options.infoLatency) {
      await new Promise(resolve =>
        setTimeout(resolve, this.options.infoLatency),
      );
    }
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

  async verifyInstallation(
    name: string,
    capability: string,
    args?: { inputs?: VerifyInputs },
  ): Promise<VerifyResult> {
    this.liveVerifies.push({ installation: name, capability, args });
    if (this.options.liveError) {
      throw this.options.liveError;
    }
    return {
      ...(this.options.live ?? LIVE),
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
