import {
  normalizeSessionList,
  type KagentSession,
  type SessionRecordWire,
} from '@giantswarm/backstage-plugin-agent-platform-common';
import { TAGS_ANNOTATION } from '@giantswarm/backstage-plugin-gs-common';
import {
  inInstallation,
  type AgentState,
  type FixtureAgent,
  type FixtureOrganization,
  type FixtureSession,
  type OrganizationRole,
} from '@giantswarm/backstage-plugin-gs-common/fixtures';
import {
  AGENT_BLOCKED_REASON,
  AGENT_BOOT_PENDING_REASON,
  AGENT_CONDITION_STAGE_ORDER,
  AgentConditionType,
  type AgentCondition,
  type AgentInterface,
  type HarnessInterface,
  type ModelConfigInterface,
  type RemoteMCPServerInterface,
} from '@giantswarm/backstage-plugin-kubernetes-react';

import type {
  AgentApprovalSetting,
  AgentManagerAgent,
  AgentObjectStatus,
  AgentPluginEntry,
  AgentSkillEntry,
  AgentToolEntry,
} from '../../lib/agentManager';
import { DEFAULT_MODEL_ANNOTATION } from '../../lib/defaultModel';
import { DEFAULT_WORKSPACE_ANNOTATION } from '../../lib/defaultWorkspace';
import { MUSTER_MCP_SERVER_NAME, TOOLSET_HEADER } from '../../lib/toolset';
import {
  ORPHANED_DELETE_MERGED,
  type OrganizationSummary,
  type ListedOrganization,
  type OrganizationPermissions,
  type OrganizationSubject,
} from '../../lib/organizations';
import { FIXTURE_USER } from './fixtureIdentity';
import { runtimeLostFailure } from './kagentConversations';

/**
 * The fixture data set's records as the agent-platform plugin's clients read
 * them (docs/fixtures.md). Each function maps one record onto the type a
 * client returns, so a change to that type breaks the fixture's build.
 */

/** The Harness every fixture agent runs on. */
export const FIXTURE_HARNESS = 'kagent';

/** The ModelConfig every fixture agent reads. */
export const FIXTURE_MODEL_CONFIG = 'default';

/** The toolset of the agents the data set builds. */
export const FIXTURE_TOOLSET = ['preset:read-only'];

/**
 * What an agent of the data set carries beyond its record once agent-manager
 * wrote it: the fields of the create and edit forms, and the generations of
 * its Agent object. Each is optional, with the data set's agents' value as
 * the default, so a record of the data set maps as it is.
 */
export type FixtureAgentDetails = {
  tags?: string[];
  systemMessage?: string;
  modelConfig?: string;
  harness?: string;
  iconUrl?: string;
  skills?: AgentSkillEntry[];
  plugins?: AgentPluginEntry[];
  toolset?: string[];
  /**
   * The tool list with its approval settings, where agent-manager takes
   * them (tool approval); its selectors are `toolset`.
   */
  tools?: AgentToolEntry[];
  /** The list's default approval setting. */
  defaultApproval?: AgentApprovalSetting;
  egress?: string[];
  egressPolicyRefs?: string[];
  /** The organization's own connectors it binds (`connectors`). */
  connectors?: string[];
  defaultWorkspace?: string;
  /** The Agent object's `metadata.generation`; 1 by default. */
  generation?: number;
  /** The generation the controller's verdict is about; `generation` by default. */
  observedGeneration?: number;
  /** When the controller's verdict last changed; its creation by default. */
  changedAt?: string;
  /**
   * The model of the generation the verdict is about, while a later write
   * settles; `modelConfig` by default.
   */
  observedModelConfig?: string;
};

/** An agent of the data set, with what agent-manager wrote of it. */
export type FixtureAgentRecord = FixtureAgent & FixtureAgentDetails;

function generationsOf(agent: FixtureAgentRecord): {
  generation: number;
  observedGeneration: number;
} {
  const generation = agent.generation ?? 1;
  return {
    generation,
    observedGeneration: agent.observedGeneration ?? generation,
  };
}

type Verdict = 'True' | 'False' | 'Unknown';

/**
 * The controller's verdict in each state, by condition. `pending` has none:
 * the controller has not looked at the agent yet.
 */
const VERDICTS: Record<AgentState, Record<string, Verdict> | undefined> = {
  ready: {
    [AgentConditionType.Accepted]: 'True',
    [AgentConditionType.ResolvedRefs]: 'True',
    [AgentConditionType.Compatible]: 'True',
    [AgentConditionType.Ready]: 'True',
  },
  notReady: {
    [AgentConditionType.Accepted]: 'True',
    [AgentConditionType.ResolvedRefs]: 'True',
    [AgentConditionType.Compatible]: 'True',
    [AgentConditionType.Ready]: 'False',
  },
  failed: {
    [AgentConditionType.Accepted]: 'True',
    [AgentConditionType.ResolvedRefs]: 'False',
    [AgentConditionType.Compatible]: 'False',
    [AgentConditionType.Ready]: 'False',
  },
  pending: undefined,
};

/**
 * Why a stage is `False` when it is the first to fail, in kagent's words: the
 * revision still booting, or the agent's model not found (the message as
 * kagent's compiler writes it, which the page reads the failing field from).
 */
function firstFailureOf(
  type: string,
  agent: FixtureAgentRecord,
): { reason: string; message: string } {
  return type === AgentConditionType.Ready
    ? {
        reason: AGENT_BOOT_PENDING_REASON,
        message: 'The Harness is booting the revision.',
      }
    : {
        reason: 'ModelConfigNotFound',
        message: `resolve ModelConfig "${agent.observedModelConfig ?? agent.modelConfig ?? FIXTURE_MODEL_CONFIG}": not found`,
      };
}

function conditionsOf(agent: FixtureAgentRecord, at: string): AgentCondition[] {
  const verdicts = VERDICTS[agent.state];
  if (!verdicts) {
    return [];
  }
  const { observedGeneration } = generationsOf(agent);
  let failedBefore = false;
  return AGENT_CONDITION_STAGE_ORDER.map(type => {
    const status = verdicts[type];
    const condition: AgentCondition = {
      type,
      status,
      reason: type,
      lastTransitionTime: agent.changedAt ?? at,
      observedGeneration,
    };
    if (status === 'False') {
      Object.assign(
        condition,
        failedBefore
          ? { reason: AGENT_BLOCKED_REASON }
          : firstFailureOf(type, agent),
      );
      failedBefore = true;
    }
    return condition;
  });
}

/**
 * An agent as the kagent `Agent` object the agent pages list. `at` is when
 * its conditions last changed. Undefined for an agent whose release failed:
 * it rendered no Agent.
 */
export function agentObjectOf(
  agent: FixtureAgentRecord,
  at: string,
): AgentInterface | undefined {
  if (agent.release === 'failed') {
    return undefined;
  }
  const conditions = conditionsOf(agent, at);
  const { generation, observedGeneration } = generationsOf(agent);
  const tags = agent.tags ?? [];
  const egressPolicyRefs = agent.egressPolicyRefs ?? [];
  return {
    apiVersion: 'api.kagent.dev/v1alpha3',
    kind: 'Agent',
    metadata: {
      name: agent.name,
      namespace: agent.namespace,
      generation,
      creationTimestamp: at,
      annotations: {
        'ui.giantswarm.io/display-name': agent.displayName,
        ...(tags.length > 0 && { [TAGS_ANNOTATION]: tags.join(',') }),
        ...(agent.iconUrl && { 'ui.giantswarm.io/icon-url': agent.iconUrl }),
        ...(agent.defaultWorkspace && {
          [DEFAULT_WORKSPACE_ANNOTATION]: agent.defaultWorkspace,
        }),
      },
    },
    spec: {
      template: {
        description: agent.description,
        modelConfig: { name: agent.modelConfig ?? FIXTURE_MODEL_CONFIG },
        ...(agent.systemMessage && { systemPrompt: agent.systemMessage }),
        tools: [
          { mcp: { server: { kind: 'RemoteMCPServer', name: agent.name } } },
        ],
      },
      harnessRef: { name: agent.harness ?? FIXTURE_HARNESS },
      ...((agent.egress ?? []).length > 0 && { egress: agent.egress }),
      ...(egressPolicyRefs.length > 0 && {
        egressPolicyRefs: egressPolicyRefs.map(name => ({ name })),
      }),
    },
    ...(conditions.length > 0 && {
      status: { observedGeneration, conditions },
    }),
  } as AgentInterface;
}

/**
 * The agent's carrier, the `RemoteMCPServer` named after it that the chart
 * renders for the gateway: its toolset header is what the pages read the
 * agent's toolset from.
 */
export function carrierObjectOf(
  agent: FixtureAgentRecord,
  at: string,
): RemoteMCPServerInterface | undefined {
  if (agent.release === 'failed') {
    return undefined;
  }
  return {
    apiVersion: 'api.kagent.dev/v1alpha3',
    kind: 'RemoteMCPServer',
    metadata: {
      name: agent.name,
      namespace: agent.namespace,
      creationTimestamp: at,
      labels: { 'app.kubernetes.io/instance': agent.name },
    },
    spec: {
      description: `The ${MUSTER_MCP_SERVER_NAME} gateway of ${agent.displayName}.`,
      url: `http://${MUSTER_MCP_SERVER_NAME}.${MUSTER_MCP_SERVER_NAME}.svc/mcp`,
      protocol: 'STREAMABLE_HTTP',
      headersFrom: [
        {
          name: TOOLSET_HEADER,
          value: (agent.toolset ?? FIXTURE_TOOLSET).join(','),
        },
      ],
    },
  } as RemoteMCPServerInterface;
}

function verdictOf(verdict: Verdict | undefined): boolean | null {
  return verdict === undefined || verdict === 'Unknown'
    ? null
    : verdict === 'True';
}

/**
 * An agent as agent-manager's `get_agent` reads it back. Its HelmRelease is
 * ready apart from the agent: the release installs a failed agent as well.
 * One whose release failed has no Agent object.
 */
export function agentManagerAgentOf(
  agent: FixtureAgentRecord,
): AgentManagerAgent {
  const exists = agent.release === 'ready';
  const verdicts = exists ? VERDICTS[agent.state] : undefined;
  const { generation, observedGeneration } = generationsOf(agent);
  const harness = agent.harness ?? FIXTURE_HARNESS;
  const status: AgentObjectStatus = {
    exists,
    ...(exists && { generation }),
    ...(verdicts && { observedGeneration }),
    harness,
    ready: verdictOf(verdicts?.[AgentConditionType.Ready]),
    accepted: verdictOf(verdicts?.[AgentConditionType.Accepted]),
    resolvedRefs: verdictOf(verdicts?.[AgentConditionType.ResolvedRefs]),
    compatible: verdictOf(verdicts?.[AgentConditionType.Compatible]),
  };
  return {
    name: agent.name,
    namespace: agent.namespace,
    exists,
    displayName: agent.displayName,
    description: agent.description,
    ...(agent.tags?.length && { tags: agent.tags }),
    modelConfig: agent.modelConfig ?? FIXTURE_MODEL_CONFIG,
    ...(agent.iconUrl && { iconUrl: agent.iconUrl }),
    ...(agent.systemMessage && { systemMessage: agent.systemMessage }),
    skills: agent.skills ?? [],
    plugins: agent.plugins ?? [],
    toolset: agent.toolset ?? FIXTURE_TOOLSET,
    ready: status.ready,
    harness,
    egress: agent.egress ?? [],
    egressPolicyRefs: agent.egressPolicyRefs ?? [],
    ...(agent.connectors?.length && { connectors: agent.connectors }),
    ...(agent.defaultWorkspace && {
      defaultWorkspace: agent.defaultWorkspace,
    }),
    status,
    managed: 'helmrelease',
    helmRelease: {
      name: agent.name,
      namespace: agent.namespace,
      suspended: false,
      gitOpsOwned: false,
      deleting: false,
      ...(exists
        ? { ready: true, reason: 'InstallSucceeded' }
        : {
            ready: false,
            reason: 'InstallFailed',
            message:
              'Helm install failed: the chart values do not match its schema.',
          }),
    },
  };
}

/** The revision Flux last applied the fixture organizations from. */
const LAST_APPLIED_REVISION =
  'main@sha1:4f9c2e1a7b3d8e6f0a5c9b2d1e7f3a8c6b4d2e0f';

/** The admins group of a fixture organization, in its `spec.admins`. */
export function fixtureAdminGroupOf(name: string): string {
  return `${name}-admins`;
}

/**
 * A fixture organization's `spec.admins`: its admins group, and the
 * signed-in person where they are an admin of it.
 */
export function fixtureAdminsOf(
  organization: FixtureOrganization,
): OrganizationSubject[] {
  return [
    { kind: 'Group', name: fixtureAdminGroupOf(organization.name) },
    ...(organization.role === 'admin'
      ? [{ kind: 'User', name: FIXTURE_USER.email }]
      : []),
  ];
}

/**
 * A fixture organization as fixture mode keeps it: its admins once a write
 * changed them (`update_organization`), the data set's otherwise.
 */
export type FixtureOrganizationState = FixtureOrganization & {
  admins?: OrganizationSubject[];
};

/** An organization as `get_organization` answers it. */
function platformOrganizationOf(
  organization: FixtureOrganizationState,
): OrganizationSummary {
  const { state } = organization;
  const orphaned = state === 'orphaned' || state === 'pendingErase';
  return {
    name: organization.name,
    displayName: organization.displayName,
    ...(organization.namespace && { namespace: organization.namespace }),
    admins: organization.admins ?? fixtureAdminsOf(organization),
    harnesses: [FIXTURE_HARNESS],
    workerReplicas: 2,
    ready:
      state === 'pending'
        ? {
            status: 'False',
            reason: 'NamespacePending',
            message: 'The operator has not created the namespace yet.',
          }
        : { status: 'True', reason: 'Ready' },
    defaultModelConfigured: { status: 'True', reason: 'Configured' },
    ...(orphaned && {
      orphaned:
        state === 'pendingErase'
          ? {
              status: 'True',
              reason: ORPHANED_DELETE_MERGED,
              message: 'The pull request deleting the organization merged.',
            }
          : {
              status: 'True',
              reason: 'Missing',
              message: 'The organization is missing from git.',
            },
      lastAppliedRevision: LAST_APPLIED_REVISION,
    }),
    ...(state === 'deleting' && { deleting: true, erasureStep: 'sessions' }),
  };
}

/** What the person may do in an organization, by their role in it. */
const PERMISSIONS: Record<OrganizationRole, OrganizationPermissions> = {
  admin: { manage: true, member: true, createAgents: true },
  editor: { manage: false, member: true, createAgents: true },
  user: { manage: false, member: true, createAgents: false },
  none: { manage: false, member: false, createAgents: false },
};

/** What a role in an organization lets the person do there. */
export function permissionsOf(role: OrganizationRole): OrganizationPermissions {
  return PERMISSIONS[role];
}

/**
 * An organization as `list_organizations` lists it: with the object
 * `get_organization` answers when the person manages it, its status only
 * otherwise.
 */
export function listedOrganizationOf(
  organization: FixtureOrganizationState,
): ListedOrganization {
  const details = platformOrganizationOf(organization);
  const permissions = permissionsOf(organization.role);
  return {
    name: organization.name,
    displayName: organization.displayName,
    ...(organization.namespace && { namespace: organization.namespace }),
    ...(details.orphaned && { orphaned: details.orphaned }),
    ...(details.deleting && { deleting: true }),
    permissions,
    ...(permissions.manage && { organization: details }),
  };
}

/** A session as the kagent API v2 Session record (proto3 JSON). */
export function sessionRecordOf(session: FixtureSession): SessionRecordWire {
  return {
    id: session.id,
    creator: FIXTURE_USER.sub,
    agent: session.agent,
    state: `RUNTIME_STATE_${session.state.toUpperCase()}`,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    name: session.title,
    contextId: session.id,
    ...(session.state === 'failed' && {
      failure: {
        reason: 'WorkerLost',
        message: 'The worker running the session stopped answering.',
      },
    }),
    ...(session.turn === 'runtimeLost' && {
      failure: runtimeLostFailure(session.id),
    }),
    changed: [],
  };
}

/**
 * The sessions of one installation as `KagentApi.listSessions` returns them:
 * their records read by the same parser the real client's answers go
 * through. Sessions of other installations are left out.
 */
export function kagentSessionsOf(
  sessions: readonly FixtureSession[],
  installation: string,
): KagentSession[] {
  return normalizeSessionList(
    { sessions: inInstallation(sessions, installation).map(sessionRecordOf) },
    installation,
  ).sessions;
}

/** A model (ModelConfig) of an organization namespace. */
export type FixtureModel = {
  namespace: string;
  name: string;
  provider: NonNullable<ModelConfigInterface['spec']>['provider'];
  model: string;
  /** The namespace's default model. */
  default: boolean;
  /** The Secret and key the model reads its key from; no Secret reads none. */
  secret: string;
  key: string;
  displayName?: string;
  /** Vertex AI: the Google Cloud project and location the model runs in. */
  projectID?: string;
  location?: string;
  /** OpenAI, Anthropic: the base URL; Ollama: the host. */
  endpoint?: string;
  /** The Helm release that renders the model, which a portal write must not fight. */
  helmRelease?: string;
  /** The token limit of an answer; absent is the provider's default. */
  maxTokens?: number;
  /** Anthropic: prompt caching and its cache time. */
  promptCaching?: boolean;
  cacheTTL?: string;
  /**
   * Its key Secret is missing: kagent accepts the settings and cannot
   * resolve the Secret, so the model reads as Incomplete.
   */
  keyMissing?: boolean;
};

/** The block of a ModelConfig's spec that holds a provider's settings. */
const PROVIDER_BLOCKS: Partial<Record<string, string>> = {
  OpenAI: 'openAI',
  Anthropic: 'anthropic',
  Ollama: 'ollama',
  AnthropicVertexAI: 'anthropicVertexAI',
  GeminiVertexAI: 'geminiVertexAI',
};

/** The key of a provider's block in a ModelConfig's spec. */
export function providerBlockKey(provider: string | undefined): string {
  return PROVIDER_BLOCKS[provider ?? ''] ?? (provider ?? '').toLowerCase();
}

/** Whether a provider runs on Vertex AI, which reads a service-account key. */
export function isVertexProvider(provider: string | undefined): boolean {
  return provider === 'AnthropicVertexAI' || provider === 'GeminiVertexAI';
}

/** The provider block of a model's spec, as agent-manager writes it. */
export function providerBlockOf(
  model: FixtureModel,
): Record<string, Record<string, string | number | boolean>> {
  const block = PROVIDER_BLOCKS[model.provider ?? ''];
  if (!block) {
    return {};
  }
  const settings: Record<string, string | number | boolean> = {};
  if (model.maxTokens) settings.maxTokens = model.maxTokens;
  if (model.promptCaching !== undefined) {
    settings.promptCaching = model.promptCaching;
  }
  if (model.cacheTTL) settings.cacheTTL = model.cacheTTL;
  if (isVertexProvider(model.provider)) {
    if (model.projectID) settings.projectID = model.projectID;
    if (model.location) settings.location = model.location;
  } else if (model.endpoint) {
    settings[model.provider === 'Ollama' ? 'host' : 'baseUrl'] = model.endpoint;
  }
  return Object.keys(settings).length > 0 ? { [block]: settings } : {};
}

/**
 * A model as the `ModelConfig` object the pages list, accepted and resolved
 * (but for a missing key Secret, `keyMissing`), the namespace's default
 * annotated as agent-manager marks it.
 */
export function modelConfigObjectOf(
  model: FixtureModel,
  at: string,
): ModelConfigInterface {
  return {
    apiVersion: 'api.kagent.dev/v1alpha3',
    kind: 'ModelConfig',
    metadata: {
      name: model.name,
      namespace: model.namespace,
      generation: 1,
      creationTimestamp: at,
      annotations: {
        ...(model.default && { [DEFAULT_MODEL_ANNOTATION]: 'true' }),
        ...(model.displayName && {
          'ui.giantswarm.io/display-name': model.displayName,
        }),
        ...(model.helmRelease && {
          'meta.helm.sh/release-name': model.helmRelease,
          'meta.helm.sh/release-namespace': model.namespace,
        }),
      },
      ...(model.helmRelease && {
        labels: { 'app.kubernetes.io/managed-by': 'Helm' },
      }),
    },
    spec: {
      provider: model.provider,
      model: model.model,
      ...(model.secret && {
        apiKeySecret: model.secret,
        apiKeySecretKey: model.key,
      }),
      ...providerBlockOf(model),
    },
    status: {
      observedGeneration: 1,
      conditions: ['Accepted', 'ResolvedRefs'].map(type => {
        const unresolved = model.keyMissing && type === 'ResolvedRefs';
        return {
          type,
          status: unresolved ? 'False' : 'True',
          reason: unresolved ? 'SecretNotFound' : type,
          message: unresolved
            ? `Secret ${model.namespace}/${model.secret} not found`
            : '',
          lastTransitionTime: at,
        };
      }),
    },
  } as ModelConfigInterface;
}

/** The platform Harness of an organization namespace, which runs kagent. */
export function harnessObjectOf(
  namespace: string,
  at: string,
): HarnessInterface {
  return {
    apiVersion: 'api.kagent.dev/v1alpha3',
    kind: 'Harness',
    metadata: {
      name: FIXTURE_HARNESS,
      namespace,
      creationTimestamp: at,
      annotations: { 'ui.giantswarm.io/display-name': 'kagent' },
    },
    spec: {
      kagent: {},
      workload: {
        image: `registry.example.com/harnesses/${FIXTURE_HARNESS}@sha256:${'0'.repeat(64)}`,
      },
      substrate: {
        workerPoolRef: { name: 'default' },
        snapshotPolicy: { location: 's3://snapshots.example.com/harnesses' },
      },
    },
  } as HarnessInterface;
}
