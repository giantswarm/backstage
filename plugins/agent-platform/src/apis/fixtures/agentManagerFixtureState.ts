import { dump } from 'js-yaml';
import {
  baseDataSet,
  inInstallation,
  type AgentState,
  type FixtureDataSet,
  type FixtureOrganization,
} from '@giantswarm/backstage-plugin-gs-common/fixtures';
import type { KubeObjectInterface } from '@giantswarm/backstage-plugin-kubernetes-react';

import type {
  AgentManagerAgent,
  AgentManagerEgressPolicy,
  AgentManagerModelConfig,
  AgentManifests,
  AgentSpec,
  AgentStatus,
  AgentStatusVerdict,
  AgentUpdate,
  CreateAgentResult,
  DeleteAgentResult,
  StartSessionRequest,
  StartSessionResult,
  UpdateAgentResult,
  ValidateAgentResult,
} from '../../lib/agentManager';
import type {
  CredentialOperation,
  CredentialOperationRead,
  CredentialReference,
  CredentialResourceResult,
  CredentialValue,
} from '../../lib/credentialOperations';
import {
  FIRST_ADMINS_BINDING,
  type MemberRequest,
  type MemberResult,
  type MemberRole,
  type OrganizationAgentSessions,
  type OrganizationConnector,
  type OrganizationCredentialReplacement,
  type OrganizationDeleteResult,
  type OrganizationDetails,
  type OrganizationErasure,
  type OrganizationListing,
  type OrganizationMember,
  type OrganizationModelRequest,
  type ListedOrganization,
} from '../../lib/organizations';
import {
  FIXTURE_HARNESS,
  FIXTURE_MODEL_CONFIG,
  FIXTURE_TOOLSET,
  agentManagerAgentOf,
  agentObjectOf,
  carrierObjectOf,
  harnessObjectOf,
  listedOrganizationOf,
  modelConfigObjectOf,
  type FixtureAgentRecord,
  type FixtureModel,
} from './agentPlatformFixtureData';
import { FIXTURE_USER } from './fixtureIdentity';
import { kagentFixtureState, KagentFixtureState } from './kagentFixtureState';

/**
 * agent-manager's state in fixture mode (docs/fixtures.md): the base data
 * set's organizations and agents of each installation, plus each
 * organization's models, members, connectors and egress policies, and the
 * credential operations its writes prepare. Writes change it in memory only,
 * so they last until the page reloads. Its methods hand out what they hold;
 * the fixture server and credentials API copy every answer, as a tool call
 * parses a fresh one.
 *
 * A write settles the way the controller would: an agent created or changed
 * reports its new generation at once and the controller's verdict on it
 * {@link SETTLE_MS} later, so the pages' progress shows before the result.
 * An organization being erased takes one such step per stage of the erasure
 * and is gone after the last.
 */

/** How long the controller takes to reach a verdict on a written agent. */
export const SETTLE_MS = 4000;

/** The stages of an erase the operator goes through, one per {@link SETTLE_MS}. */
export const ERASURE_STEPS = ['sessions', 'agents', 'namespace'] as const;

/** How long a credential operation stays open. */
export const OPERATION_TTL_MS = 30 * 60 * 1000;

/** The model the agents the data set builds as failed read: none has it. */
export const RETIRED_MODEL_CONFIG = 'retired';

const DAY = 24 * 60 * 60 * 1000;

/** The error of a refusal, in agent-manager's words: `<code>: <message>`. */
export function refusal(code: string, message: string): Error {
  return new Error(`${code}: ${message}`);
}

/**
 * A refusal of the credential operations' HTTP API: the status and
 * agent-manager's code, which the fixture `AgentManagerCredentialsApi` turns
 * into the `ResponseError` the real client throws.
 */
export class CredentialRefusal extends Error {
  readonly name = 'CredentialRefusal';
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

type StoredAgent = FixtureAgentRecord & {
  /** When the agent was created; the data set's creation time if unset. */
  createdAt?: string;
  /** When the last write was made. */
  writtenAt?: number;
  /** When the controller reaches its verdict on the last write. */
  settlesAt?: number;
  /** The state the agent settles in. */
  settledState?: AgentState;
  /** The model of the generation the controller last reported on. */
  previousModelConfig?: string;
};

type StoredOperation = {
  installation: string;
  operation: CredentialOperation;
  /** Writes what the operation prepared, once its values are saved. */
  apply: () => CredentialResourceResult;
};

type InstallationState = {
  organizations: FixtureOrganization[];
  agents: Map<string, StoredAgent>;
  models: Map<string, FixtureModel>;
  members: Map<string, OrganizationMember[]>;
  /** When the erase of an organization started, by `parent/name`. */
  erasing: Map<string, number>;
};

/** `get_agent_status`'s verdict on an agent the release rendered. */
const VERDICT_OF: Record<AgentState, AgentStatusVerdict> = {
  ready: 'ready',
  notReady: 'progressing',
  pending: 'progressing',
  failed: 'failed',
};

const keyOf = (namespace: string, name: string) => `${namespace}/${name}`;

/** Lowercase letters, digits and `-`, a letter first and none last: a release name. */
const AGENT_NAME = /^[a-z]([-a-z0-9]{0,51}[a-z0-9])?$/;

/** The environment variable a provider's key goes in. */
function keyNameOf(provider: string | undefined): string {
  switch (provider) {
    case 'OpenAI':
    case 'AzureOpenAI':
      return 'OPENAI_API_KEY';
    case 'Anthropic':
      return 'ANTHROPIC_API_KEY';
    case 'Gemini':
      return 'GOOGLE_API_KEY';
    default:
      return 'API_KEY';
  }
}

function hexId(length: number): string {
  const bytes = new Uint8Array(length / 2);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

/** The RoleBinding of a role: one per role, holding its subjects. */
function bindingOf(role: MemberRole): string {
  return role === 'admin' ? FIRST_ADMINS_BINDING : `organization-${role}s`;
}

/** Groups first, as `list_organization_members` answers. */
function groupsFirst(members: OrganizationMember[]): OrganizationMember[] {
  return [
    ...members.filter(member => member.kind === 'Group'),
    ...members.filter(member => member.kind !== 'Group'),
  ];
}

/** The members an organization starts with: two groups and the person. */
function membersOf(organization: FixtureOrganization): OrganizationMember[] {
  const member = (
    kind: string,
    name: string,
    role: MemberRole,
  ): OrganizationMember => ({ kind, name, role, binding: bindingOf(role) });
  return [
    member('Group', `${organization.name}-admins`, 'admin'),
    member('Group', `${organization.name}-developers`, 'editor'),
    ...(organization.role === 'none'
      ? []
      : [member('User', FIXTURE_USER.email, organization.role)]),
  ];
}

/** The chart values an agent's release carries. */
function valuesOf(agent: FixtureAgentRecord): Record<string, unknown> {
  return {
    agent: {
      name: agent.name,
      displayName: agent.displayName,
      ...(agent.description && { description: agent.description }),
      ...(agent.tags?.length && { tags: agent.tags }),
      ...(agent.systemMessage && { systemMessage: agent.systemMessage }),
      modelConfig: agent.modelConfig ?? FIXTURE_MODEL_CONFIG,
      harness: agent.harness ?? FIXTURE_HARNESS,
      ...(agent.iconUrl && { iconUrl: agent.iconUrl }),
      skills: agent.skills ?? [],
      plugins: agent.plugins ?? [],
      toolset: agent.toolset ?? FIXTURE_TOOLSET,
      egress: agent.egress ?? [],
      egressPolicyRefs: agent.egressPolicyRefs ?? [],
      ...(agent.defaultWorkspace && {
        defaultWorkspace: agent.defaultWorkspace,
      }),
    },
  };
}

/** The objects a write of the agent applies, as YAML, and their values. */
function manifestsOf(agent: FixtureAgentRecord): AgentManifests {
  const values = valuesOf(agent);
  return {
    ociRepository: dump({
      apiVersion: 'source.toolkit.fluxcd.io/v1',
      kind: 'OCIRepository',
      metadata: { name: 'agent-chart', namespace: agent.namespace },
      spec: {
        interval: '30m',
        url: 'oci://registry.example.com/charts/agent',
        ref: { semver: '1.x' },
      },
    }),
    helmRelease: dump({
      apiVersion: 'helm.toolkit.fluxcd.io/v2',
      kind: 'HelmRelease',
      metadata: { name: agent.name, namespace: agent.namespace },
      spec: {
        interval: '10m',
        chartRef: { kind: 'OCIRepository', name: 'agent-chart' },
        values,
      },
    }),
    values,
  };
}

/** The dotted paths whose values differ between two value trees. */
function changedPaths(before: unknown, after: unknown, prefix = ''): string[] {
  const isObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);
  if (isObject(before) && isObject(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    return [...keys]
      .sort()
      .flatMap(key =>
        changedPaths(
          before[key],
          after[key],
          prefix ? `${prefix}.${key}` : key,
        ),
      );
  }
  return JSON.stringify(before) === JSON.stringify(after) ? [] : [prefix];
}

/** A field of an update: absent keeps it, `""` clears it. */
function updated(
  current: string | undefined,
  next: string | undefined,
): string | undefined {
  if (next === undefined) {
    return current;
  }
  return next === '' ? undefined : next;
}

/** A create's refusal of a name the namespace has. */
function nameTaken(agent: FixtureAgentRecord): string {
  return `a HelmRelease named ${agent.name} already exists in namespace ${agent.namespace}`;
}

/** A write in mode `commit`: this agent-manager writes live only. */
function mustBeLive(mode: unknown): void {
  if (mode === 'commit') {
    throw refusal(
      'unsupported',
      'this agent-manager writes live only: it has no commit capability',
    );
  }
}

export class AgentManagerFixtureState {
  private readonly installations = new Map<string, InstallationState>();
  private readonly operations = new Map<string, StoredOperation>();
  /** The answers of the writes that take an idempotency key, by key. */
  private readonly answered = new Map<string, unknown>();
  private revision = 0;
  private readonly objectsCache = new Map<
    string,
    { revision: number; validUntil: number; objects: KubeObjectInterface[] }
  >();
  /** When the data set's objects were created. */
  private readonly createdAt: string;

  /** Where a started session is created, for kagent to serve it. */
  private readonly kagent: () => KagentFixtureState;

  constructor(
    private readonly data: FixtureDataSet = baseDataSet(),
    private readonly now: () => number = Date.now,
    /**
     * kagent's state, the shared one for the base data set; another data set
     * gets a state of its own, so its sessions stay out of the shared one.
     */
    kagent?: () => KagentFixtureState,
  ) {
    let own: KagentFixtureState | undefined;
    this.kagent =
      kagent ??
      (data === baseDataSet()
        ? kagentFixtureState
        : () => {
            own ??= new KagentFixtureState(data, now);
            return own;
          });
    this.createdAt = new Date(this.now() - 7 * DAY).toISOString();
  }

  private stateOf(installation: string): InstallationState {
    let state = this.installations.get(installation);
    if (!state) {
      const organizations = inInstallation(
        this.data.organizations,
        installation,
      ).map(organization => ({ ...organization }));
      const agents = new Map<string, StoredAgent>(
        inInstallation(this.data.agents, installation).map(agent => [
          keyOf(agent.namespace, agent.name),
          {
            ...agent,
            modelConfig:
              agent.state === 'failed'
                ? RETIRED_MODEL_CONFIG
                : FIXTURE_MODEL_CONFIG,
            toolset: [...FIXTURE_TOOLSET],
          },
        ]),
      );
      const models = new Map<string, FixtureModel>();
      const members = new Map<string, OrganizationMember[]>();
      for (const organization of organizations) {
        if (!organization.namespace) {
          continue;
        }
        models.set(keyOf(organization.namespace, FIXTURE_MODEL_CONFIG), {
          namespace: organization.namespace,
          name: FIXTURE_MODEL_CONFIG,
          provider: 'OpenAI',
          model: 'gpt-4.1-mini',
          default: true,
          secret: `${FIXTURE_MODEL_CONFIG}-model-key`,
          key: keyNameOf('OpenAI'),
        });
        members.set(organization.namespace, membersOf(organization));
      }
      state = { organizations, agents, models, members, erasing: new Map() };
      this.installations.set(installation, state);
    }
    this.finishErasures(state);
    return state;
  }

  private changed(): void {
    this.revision++;
  }

  /**
   * Answers a write that takes an idempotency key once: a retry with the
   * same key gets the first answer and writes nothing.
   */
  private once<T>(
    installation: string,
    tool: string,
    requestId: unknown,
    write: () => T,
  ): T {
    if (typeof requestId !== 'string' || !requestId) {
      return write();
    }
    const key = `${installation}/${tool}/${requestId}`;
    if (!this.answered.has(key)) {
      this.answered.set(key, write());
    }
    return this.answered.get(key) as T;
  }

  // Organizations

  private erasureKey(organization: FixtureOrganization): string {
    return `${organization.parent}/${organization.name}`;
  }

  /** Drops the organizations whose erase went through its last step. */
  private finishErasures(state: InstallationState): void {
    const done = state.organizations.filter(organization => {
      const since = state.erasing.get(this.erasureKey(organization));
      return (
        since !== undefined &&
        this.now() - since >= ERASURE_STEPS.length * SETTLE_MS
      );
    });
    for (const organization of done) {
      state.erasing.delete(this.erasureKey(organization));
      state.organizations = state.organizations.filter(
        other => other !== organization,
      );
      const { namespace } = organization;
      if (namespace) {
        for (const [key, agent] of state.agents) {
          if (agent.namespace === namespace) state.agents.delete(key);
        }
        for (const [key, model] of state.models) {
          if (model.namespace === namespace) state.models.delete(key);
        }
        state.members.delete(namespace);
      }
    }
    if (done.length > 0) {
      this.changed();
    }
  }

  /** An organization as agent-manager lists it, on its erase's current step. */
  private listed(
    installation: string,
    organization: FixtureOrganization,
  ): ListedOrganization {
    const listed = listedOrganizationOf(organization);
    const since = this.stateOf(installation).erasing.get(
      this.erasureKey(organization),
    );
    if (since !== undefined && listed.organization) {
      const step = Math.min(
        Math.floor((this.now() - since) / SETTLE_MS),
        ERASURE_STEPS.length - 1,
      );
      listed.organization.erasureStep = ERASURE_STEPS[step];
    }
    return listed;
  }

  private organizationIn(
    installation: string,
    namespace: string,
  ): FixtureOrganization {
    const organization = this.stateOf(installation).organizations.find(
      candidate => candidate.namespace === namespace,
    );
    if (!organization) {
      throw refusal(
        'not_found',
        `no organization has the namespace ${namespace}`,
      );
    }
    return organization;
  }

  /** An organization whose namespace may still be written to. */
  private writableIn(
    installation: string,
    namespace: string,
  ): FixtureOrganization {
    const organization = this.organizationIn(installation, namespace);
    if (organization.state === 'deleting') {
      throw refusal(
        'conflict',
        `the organization ${organization.name} is being erased`,
      );
    }
    return organization;
  }

  private organizationNamed(
    installation: string,
    parent: string,
    name: string,
  ): FixtureOrganization {
    const organization = this.stateOf(installation).organizations.find(
      candidate => candidate.parent === parent && candidate.name === name,
    );
    if (!organization) {
      throw refusal(
        'not_found',
        `AgentPlatformOrganization ${parent}/${name} not found`,
      );
    }
    return organization;
  }

  private mustManage(organization: FixtureOrganization): void {
    if (organization.role !== 'admin') {
      throw refusal(
        'forbidden',
        `${FIXTURE_USER.email} may not manage the organization ${organization.name}: that needs the admin role there.`,
      );
    }
  }

  private mustCreateAgentsIn(organization: FixtureOrganization): void {
    if (organization.role !== 'admin' && organization.role !== 'editor') {
      throw refusal(
        'forbidden',
        `${FIXTURE_USER.email} may not create agents in the organization ${organization.name}: that needs the editor role there.`,
      );
    }
  }

  listOrganizations(installation: string): OrganizationListing {
    return {
      organizations: this.stateOf(installation).organizations.map(
        organization => this.listed(installation, organization),
      ),
    };
  }

  private erasureOf(
    installation: string,
    organization: FixtureOrganization,
  ): OrganizationErasure | undefined {
    const { namespace } = organization;
    if (!namespace) {
      return undefined;
    }
    const agents = this.agentsIn(installation, namespace).map(
      agent => agent.name,
    );
    const models = this.modelsIn(installation, namespace);
    return {
      namespace,
      agents,
      helmReleases: agents,
      models: models.map(model => model.name),
      connectors: connectorsOf().map(connector => connector.name),
      egressPolicies: egressPoliciesOf(namespace).map(policy => policy.name),
      credentials: [
        ...models.map(model => model.secret),
        ...connectorsOf().flatMap(connector =>
          connector.credentials.map(credential => credential.secret),
        ),
      ],
      members: [
        ...new Set(
          (this.stateOf(installation).members.get(namespace) ?? []).map(
            member => member.binding,
          ),
        ),
      ],
      sessions: this.sessionsOf(installation, namespace),
      kept: `The parent namespace ${organization.parent} and the organization's history in git.`,
    };
  }

  /** The sessions an erase of the namespace deletes, per agent. */
  private sessionsOf(
    installation: string,
    namespace: string,
  ): OrganizationAgentSessions[] {
    const counts = new Map<string, OrganizationAgentSessions>();
    for (const session of inInstallation(this.data.sessions, installation)) {
      if (session.agent.namespace !== namespace) {
        continue;
      }
      const agent = session.agent.name;
      const entry = counts.get(agent) ?? { agent, running: 0, stopped: 0 };
      if (session.state === 'suspended' || session.state === 'failed') {
        entry.stopped++;
      } else {
        entry.running++;
      }
      counts.set(agent, entry);
    }
    return [...counts.values()];
  }

  getOrganization(
    installation: string,
    parent: string,
    name: string,
  ): OrganizationDetails {
    const organization = this.organizationNamed(installation, parent, name);
    this.mustManage(organization);
    const { organization: details } = this.listed(installation, organization);
    const erases = this.erasureOf(installation, organization);
    return { organization: details!, ...(erases && { erases }) };
  }

  deleteOrganization(
    installation: string,
    request: { parent: string; name: string; confirm?: string },
  ): OrganizationDeleteResult {
    const organization = this.organizationNamed(
      installation,
      request.parent,
      request.name,
    );
    this.mustManage(organization);
    const expected = this.erasureKey(organization);
    if (request.confirm !== expected) {
      throw refusal(
        'invalid_request',
        `confirm with ${expected} to erase the organization`,
      );
    }
    const erases = this.erasureOf(installation, organization);
    const { erasing } = this.stateOf(installation);
    if (!erasing.has(expected)) {
      erasing.set(expected, this.now());
      organization.state = 'deleting';
      this.changed();
    }
    const { organization: details } = this.listed(installation, organization);
    return {
      organization: details!,
      ...(erases && { erases }),
      deleted: true,
      next: 'The operator erases the organization namespace, step by step.',
    };
  }

  listMembers(installation: string, namespace: string): OrganizationMember[] {
    this.organizationIn(installation, namespace);
    return this.stateOf(installation).members.get(namespace) ?? [];
  }

  addMember(installation: string, request: MemberRequest): MemberResult {
    const organization = this.writableIn(installation, request.namespace);
    this.mustManage(organization);
    const role = request.role ?? 'user';
    const member: OrganizationMember = {
      kind: request.group ? 'Group' : 'User',
      name: request.group ?? request.user!,
      role,
      binding: bindingOf(role),
    };
    const members = this.listMembers(installation, request.namespace);
    const exists = members.some(
      candidate =>
        candidate.kind === member.kind &&
        candidate.name === member.name &&
        candidate.role === role,
    );
    if (!exists) {
      this.stateOf(installation).members.set(
        request.namespace,
        groupsFirst([...members, member]),
      );
      this.changed();
    }
    return {
      namespace: request.namespace,
      member,
      changed: !exists,
      bindings: [member.binding],
    };
  }

  removeMember(installation: string, request: MemberRequest): MemberResult {
    const organization = this.writableIn(installation, request.namespace);
    this.mustManage(organization);
    const kind = request.group ? 'Group' : 'User';
    const name = request.group ?? request.user!;
    const members = this.listMembers(installation, request.namespace);
    const removed = members.filter(
      member =>
        member.kind === kind &&
        member.name === name &&
        (request.role === undefined || member.role === request.role),
    );
    if (removed.length === 0) {
      throw refusal(
        'not_found',
        `${name} has no role in the organization ${organization.name}`,
      );
    }
    const kept = members.filter(member => !removed.includes(member));
    if (
      removed.some(member => member.binding === FIRST_ADMINS_BINDING) &&
      !kept.some(member => member.binding === FIRST_ADMINS_BINDING)
    ) {
      // Admission's refusal, in its words (pinned by OrganizationPage.test).
      throw refusal(
        'forbidden',
        `RoleBinding ${request.namespace}/${FIRST_ADMINS_BINDING}: if ${FIRST_ADMINS_BINDING} would lose its last admin: add another admin first (add_organization_member role admin); a lockout is a cluster-admin's to fix`,
      );
    }
    this.stateOf(installation).members.set(request.namespace, kept);
    this.changed();
    return {
      namespace: request.namespace,
      member: removed[0],
      changed: true,
      bindings: removed.map(member => member.binding),
    };
  }

  listConnectors(
    installation: string,
    namespace: string,
  ): OrganizationConnector[] {
    this.organizationIn(installation, namespace);
    return connectorsOf();
  }

  listEgressPolicies(
    installation: string,
    namespace: string,
  ): AgentManagerEgressPolicy[] {
    this.organizationIn(installation, namespace);
    return egressPoliciesOf(namespace);
  }

  // Models and credential operations

  private modelsIn(installation: string, namespace: string): FixtureModel[] {
    return [...this.stateOf(installation).models.values()].filter(
      model => model.namespace === namespace,
    );
  }

  listModelConfigs(
    installation: string,
    namespace: string,
  ): AgentManagerModelConfig[] {
    return this.modelsIn(installation, namespace).map(model => ({
      name: model.name,
      namespace: model.namespace,
      provider: model.provider,
      model: model.model,
      accepted: true,
      resolvedRefs: true,
      default: model.default,
    }));
  }

  private markDefault(installation: string, model: FixtureModel): void {
    for (const other of this.modelsIn(installation, model.namespace)) {
      other.default = other === model;
    }
  }

  private defaultModelIn(
    installation: string,
    namespace: string,
  ): string | undefined {
    return this.modelsIn(installation, namespace).find(model => model.default)
      ?.name;
  }

  private prepare(
    installation: string,
    organization: FixtureOrganization,
    operation: Omit<
      CredentialOperation,
      'id' | 'version' | 'state' | 'mode' | 'organization' | 'expiresAt'
    >,
    apply: () => CredentialResourceResult,
  ): CredentialResourceResult {
    const id = hexId(48);
    const result: CredentialResourceResult = {
      ...operation.result,
      pending: true,
      credentialOperation: id,
    };
    this.operations.set(id, {
      installation,
      operation: {
        ...operation,
        id,
        version: '1',
        expiresAt: new Date(this.now() + OPERATION_TTL_MS).toISOString(),
        state: 'pending',
        mode: 'apply',
        organization: {
          namespace: organization.namespace,
          parent: organization.parent,
          organization: organization.name,
        },
        result,
      },
      apply,
    });
    return result;
  }

  setOrganizationModel(
    installation: string,
    request: OrganizationModelRequest,
  ): CredentialResourceResult {
    const organization = this.writableIn(installation, request.namespace);
    this.mustManage(organization);
    return this.once(
      installation,
      'set_organization_model',
      request.requestId,
      () => this.writeModel(installation, organization, request),
    );
  }

  private writeModel(
    installation: string,
    organization: FixtureOrganization,
    request: OrganizationModelRequest,
  ): CredentialResourceResult {
    const { models } = this.stateOf(installation);
    const existing = models.get(keyOf(request.namespace, request.name));
    if (existing) {
      if (request.provider && request.provider !== existing.provider) {
        throw refusal(
          'invalid_request',
          `model ${existing.name} keeps its provider ${existing.provider}: its key is that provider's`,
        );
      }
      const model = request.model || existing.model;
      const makeDefault = Boolean(request.default) && !existing.default;
      if (model !== existing.model || makeDefault) {
        existing.model = model;
        if (makeDefault) {
          this.markDefault(installation, existing);
        }
        this.changed();
      }
      return {
        namespace: request.namespace,
        kind: 'model',
        name: request.name,
        created: false,
        defaultModel: this.defaultModelIn(installation, request.namespace),
      };
    }
    const provider = (request.provider ?? 'OpenAI') as FixtureModel['provider'];
    const model: FixtureModel = {
      namespace: request.namespace,
      name: request.name,
      provider,
      model: request.model ?? '',
      default: false,
      secret: `${request.name}-model-key`,
      key: keyNameOf(provider),
    };
    return this.prepare(
      installation,
      organization,
      {
        changes: [
          {
            action: 'create',
            object: {
              kind: 'ModelConfig',
              metadata: { name: model.name },
              spec: { provider: model.provider, model: model.model },
            },
          },
        ],
        references: [],
        result: {
          namespace: request.namespace,
          kind: 'model',
          name: request.name,
          credentials: [
            { secret: model.secret, key: model.key, state: 'missing' },
          ],
        },
      },
      () => {
        models.set(keyOf(model.namespace, model.name), model);
        const isFirst =
          this.modelsIn(installation, model.namespace).length === 1;
        if (request.default || isFirst) {
          this.markDefault(installation, model);
        }
        return {
          namespace: model.namespace,
          kind: 'model',
          name: model.name,
          created: true,
          defaultModel: this.defaultModelIn(installation, model.namespace),
          credentials: [
            { secret: model.secret, key: model.key, state: 'present' },
          ],
        };
      },
    );
  }

  /** The objects of the namespace that read a Secret's key. */
  private readersOf(
    installation: string,
    namespace: string,
    secret: string,
    key: string,
  ): CredentialReference[] {
    return [
      ...this.modelsIn(installation, namespace)
        .filter(model => model.secret === secret && model.key === key)
        .map((model): CredentialReference => ({
          kind: 'ModelConfig',
          name: model.name,
          key: model.key,
          provider: model.provider,
        })),
      ...connectorsOf()
        .filter(connector =>
          connector.credentials.some(
            credential =>
              credential.secret === secret && credential.key === key,
          ),
        )
        .map((connector): CredentialReference => ({
          kind: 'RemoteMCPServer',
          name: connector.name,
          key,
          url: connector.url,
        })),
    ];
  }

  replaceCredential(
    installation: string,
    request: OrganizationCredentialReplacement,
  ): CredentialResourceResult {
    const organization = this.writableIn(installation, request.namespace);
    this.mustManage(organization);
    const references = this.readersOf(
      installation,
      request.namespace,
      request.secret,
      request.key,
    );
    if (references.length === 0) {
      throw refusal(
        'not_found',
        `no object of the organization reads ${request.secret}/${request.key}`,
      );
    }
    const pair = { secret: request.secret, key: request.key };
    return this.once(
      installation,
      'replace_organization_credential',
      request.requestId,
      () =>
        this.prepare(
          installation,
          organization,
          {
            changes: [],
            references,
            result: {
              namespace: request.namespace,
              kind: 'credential',
              name: request.secret,
              credentials: [{ ...pair, state: 'replace' }],
            },
          },
          () => ({
            namespace: request.namespace,
            kind: 'credential',
            name: request.secret,
            created: false,
            credentials: [{ ...pair, state: 'present' }],
          }),
        ),
    );
  }

  private storedOperation(installation: string, id: string): StoredOperation {
    const stored = this.operations.get(id);
    const expiresAt = stored?.operation.expiresAt;
    if (
      !stored ||
      stored.installation !== installation ||
      (expiresAt !== undefined &&
        stored.operation.state === 'pending' &&
        this.now() >= Date.parse(expiresAt))
    ) {
      throw new CredentialRefusal(
        404,
        'not_found',
        'The credential request does not exist, expired, or is someone else’s.',
      );
    }
    return stored;
  }

  getOperation(installation: string, id: string): CredentialOperationRead {
    const { operation } = this.storedOperation(installation, id);
    return { operation, etag: `"${operation.version}"` };
  }

  private mustMatch(stored: StoredOperation, etag: string): void {
    if (etag !== `"${stored.operation.version}"`) {
      throw new CredentialRefusal(
        412,
        'precondition_failed',
        'The credential request changed since you opened it: reload it.',
      );
    }
    if (stored.operation.state !== 'pending') {
      throw new CredentialRefusal(
        409,
        'conflict',
        `The credential request is ${stored.operation.state}.`,
      );
    }
  }

  saveOperation(
    installation: string,
    id: string,
    etag: string,
    values: CredentialValue[],
  ): CredentialResourceResult {
    const stored = this.storedOperation(installation, id);
    this.mustMatch(stored, etag);
    const missing = (stored.operation.result?.credentials ?? []).filter(
      pair =>
        !values.some(
          value =>
            value.secret === pair.secret &&
            value.key === pair.key &&
            value.value !== '',
        ),
    );
    if (missing.length > 0) {
      throw new CredentialRefusal(
        400,
        'invalid_request',
        `A value is missing for ${missing
          .map(pair => `${pair.secret}/${pair.key}`)
          .join(', ')}.`,
      );
    }
    const result = stored.apply();
    stored.operation = {
      ...stored.operation,
      version: String(Number(stored.operation.version) + 1),
      state: 'complete',
      result,
    };
    this.changed();
    return result;
  }

  cancelOperation(installation: string, id: string, etag: string): void {
    const stored = this.storedOperation(installation, id);
    this.mustMatch(stored, etag);
    stored.operation = {
      ...stored.operation,
      version: String(Number(stored.operation.version) + 1),
      state: 'cancelled',
    };
  }

  // Agents

  /**
   * An agent as it reads now: settled once the controller's time is up.
   * Until then the controller's verdict is still about the generation
   * before the write, and names that generation's model.
   */
  private view(agent: StoredAgent): FixtureAgentRecord {
    const {
      settlesAt,
      settledState,
      writtenAt,
      previousModelConfig,
      createdAt: _,
      ...record
    } = agent;
    const generation = record.generation ?? 1;
    if (settlesAt === undefined || this.now() >= settlesAt) {
      return {
        ...record,
        state: settledState ?? record.state,
        observedGeneration: generation,
        ...(settlesAt !== undefined && {
          changedAt: new Date(settlesAt).toISOString(),
        }),
      };
    }
    return {
      ...record,
      observedGeneration: generation - 1,
      ...(previousModelConfig !== undefined && {
        observedModelConfig: previousModelConfig,
      }),
      ...(writtenAt !== undefined && {
        changedAt: new Date(writtenAt).toISOString(),
      }),
    };
  }

  private agentsIn(
    installation: string,
    namespace?: string,
  ): FixtureAgentRecord[] {
    return [...this.stateOf(installation).agents.values()]
      .filter(agent => namespace === undefined || agent.namespace === namespace)
      .map(agent => this.view(agent));
  }

  private stored(
    installation: string,
    namespace: string,
    name: string,
  ): StoredAgent {
    const agent = this.stateOf(installation).agents.get(keyOf(namespace, name));
    if (!agent) {
      throw refusal('not_found', `HelmRelease ${namespace}/${name} not found`);
    }
    return agent;
  }

  private agentAnswerOf(agent: FixtureAgentRecord): AgentManagerAgent {
    return { ...agentManagerAgentOf(agent), values: valuesOf(agent) };
  }

  getAgent(
    installation: string,
    namespace: string,
    name: string,
  ): AgentManagerAgent {
    return this.agentAnswerOf(
      this.view(this.stored(installation, namespace, name)),
    );
  }

  getAgentStatus(
    installation: string,
    namespace: string,
    name: string,
  ): AgentStatus {
    const view = this.view(this.stored(installation, namespace, name));
    const answer = agentManagerAgentOf(view);
    const verdict: AgentStatusVerdict =
      !answer.exists || view.state === 'failed'
        ? 'failed'
        : VERDICT_OF[view.state];
    const summary = {
      ready: `${name} is ready on Harness ${answer.harness}.`,
      progressing: `The Harness is starting ${name}.`,
      failed: answer.exists
        ? `${name} failed: ModelConfig "${view.observedModelConfig ?? view.modelConfig}" not found.`
        : `The release of ${name} failed: ${answer.helmRelease?.message ?? ''}`,
      unknown: `The state of ${name} is not known.`,
    }[verdict];
    return {
      name,
      namespace,
      verdict,
      summary,
      ...(answer.status && { agent: answer.status }),
      ...(answer.helmRelease && {
        helmRelease: {
          exists: true,
          ready: answer.helmRelease.ready,
          suspended: answer.helmRelease.suspended,
          gitOpsOwned: answer.helmRelease.gitOpsOwned,
          deleting: answer.helmRelease.deleting,
        },
      }),
    };
  }

  /** The violations of an agent as it would be written. */
  private violationsOf(
    installation: string,
    agent: FixtureAgentRecord,
    mode: 'create' | 'update',
  ): string[] {
    const errors: string[] = [];
    if (!AGENT_NAME.test(agent.name)) {
      errors.push(
        `name: "${agent.name}" must be lowercase letters, digits and "-", start with a letter, end with a letter or digit, and be at most 53 characters long`,
      );
    }
    if (
      mode === 'create' &&
      this.stateOf(installation).agents.has(keyOf(agent.namespace, agent.name))
    ) {
      errors.push(`name: ${nameTaken(agent)}`);
    }
    if (!agent.displayName?.trim()) {
      errors.push('agent.displayName: is required');
    }
    const model = agent.modelConfig ?? FIXTURE_MODEL_CONFIG;
    if (!this.stateOf(installation).models.has(keyOf(agent.namespace, model))) {
      errors.push(
        `modelConfig: ModelConfig "${model}" not found in namespace ${agent.namespace}`,
      );
    }
    if ((agent.harness ?? FIXTURE_HARNESS) !== FIXTURE_HARNESS) {
      errors.push(
        `harness: Harness "${agent.harness}" not found in namespace ${agent.namespace}`,
      );
    }
    for (const ref of agent.egressPolicyRefs ?? []) {
      if (
        !egressPoliciesOf(agent.namespace).some(policy => policy.name === ref)
      ) {
        errors.push(
          `egressPolicyRefs: EgressPolicy "${ref}" not found in namespace ${agent.namespace}`,
        );
      }
    }
    return errors;
  }

  private recordOf(installation: string, spec: AgentSpec): FixtureAgentRecord {
    const organization = this.stateOf(installation).organizations.find(
      candidate => candidate.namespace === spec.namespace,
    );
    return {
      installation,
      organization: organization?.name ?? spec.namespace,
      namespace: spec.namespace,
      name: spec.name,
      displayName: spec.displayName,
      description: spec.description ?? '',
      state: 'pending',
      release: 'ready',
      tags: spec.tags ?? [],
      systemMessage: spec.systemMessage,
      modelConfig: spec.modelConfig,
      harness: spec.harness || FIXTURE_HARNESS,
      iconUrl: spec.iconUrl,
      skills: spec.skills ?? [],
      plugins: spec.plugins ?? [],
      toolset: spec.toolset ?? [],
      egress: spec.egress ?? [],
      egressPolicyRefs: spec.egressPolicyRefs ?? [],
      defaultWorkspace: spec.defaultWorkspace,
      generation: 1,
    };
  }

  private validation(
    installation: string,
    agent: FixtureAgentRecord,
    mode: 'create' | 'update',
  ): ValidateAgentResult {
    const errors = this.violationsOf(installation, agent, mode);
    return {
      valid: errors.length === 0,
      mode,
      ...(errors.length > 0 && { errors }),
      schemaVersion: '1.0.0',
      schemaSource: 'registry',
      manifests: manifestsOf(agent),
    };
  }

  validateAgent(installation: string, spec: AgentSpec): ValidateAgentResult {
    this.organizationIn(installation, spec.namespace);
    return this.validation(
      installation,
      this.recordOf(installation, spec),
      'create',
    );
  }

  createAgent(
    installation: string,
    spec: AgentSpec & { mode?: string },
  ): CreateAgentResult {
    mustBeLive(spec.mode);
    this.mustCreateAgentsIn(this.writableIn(installation, spec.namespace));
    const record = this.recordOf(installation, spec);
    if (
      this.stateOf(installation).agents.has(keyOf(spec.namespace, spec.name))
    ) {
      throw refusal('conflict', nameTaken(record));
    }
    const validation = this.validation(installation, record, 'create');
    if (!validation.valid) {
      throw refusal('invalid_request', validation.errors!.join('; '));
    }
    this.stateOf(installation).agents.set(keyOf(spec.namespace, spec.name), {
      ...record,
      createdAt: new Date(this.now()).toISOString(),
      writtenAt: this.now(),
      settlesAt: this.now() + SETTLE_MS,
      settledState: 'ready',
    });
    this.changed();
    return {
      agent: {
        name: spec.name,
        namespace: spec.namespace,
        skills: spec.skills ?? [],
      },
      manifests: validation.manifests,
      created: {
        ociRepository: this.agentsIn(installation, spec.namespace).length === 1,
        helmRelease: true,
      },
      status: this.getAgentStatus(installation, spec.namespace, spec.name),
      requestedBy: FIXTURE_USER.email,
    };
  }

  /** The agent as `update` would leave it. */
  private merged(agent: StoredAgent, update: AgentUpdate): StoredAgent {
    return {
      ...agent,
      displayName: update.displayName || agent.displayName,
      description: updated(agent.description, update.description) ?? '',
      tags: update.tags ?? agent.tags,
      systemMessage: updated(agent.systemMessage, update.systemMessage),
      modelConfig: updated(agent.modelConfig, update.modelConfig),
      iconUrl: updated(agent.iconUrl, update.iconUrl),
      skills: update.skills ?? agent.skills,
      plugins: update.plugins ?? agent.plugins,
      toolset: update.toolset ?? agent.toolset,
      egress: update.egress ?? agent.egress,
      egressPolicyRefs: update.egressPolicyRefs ?? agent.egressPolicyRefs,
      defaultWorkspace: updated(
        agent.defaultWorkspace,
        update.defaultWorkspace,
      ),
      harness:
        update.harness === undefined
          ? agent.harness
          : update.harness || FIXTURE_HARNESS,
    };
  }

  validateUpdate(
    installation: string,
    update: AgentUpdate & { mode?: string },
  ): ValidateAgentResult {
    mustBeLive(update.mode);
    const agent = this.stored(installation, update.namespace, update.name);
    return this.validation(installation, this.merged(agent, update), 'update');
  }

  updateAgent(
    installation: string,
    update: AgentUpdate & { mode?: string },
  ): UpdateAgentResult {
    mustBeLive(update.mode);
    this.mustCreateAgentsIn(this.writableIn(installation, update.namespace));
    const agent = this.stored(installation, update.namespace, update.name);
    const next = this.merged(agent, update);
    const validation = this.validation(installation, next, 'update');
    if (!validation.valid) {
      throw refusal('invalid_request', validation.errors!.join('; '));
    }
    const before = valuesOf(agent);
    const after = valuesOf(next);
    const changed = changedPaths(before, after);
    if (changed.length > 0 || update.refreshSkills) {
      const current = this.view(agent);
      // What the agent settles in after the writes before this one, which
      // may still be settling.
      const settling = agent.settledState ?? current.state;
      this.stateOf(installation).agents.set(
        keyOf(agent.namespace, agent.name),
        {
          ...next,
          generation: (agent.generation ?? 1) + 1,
          state: current.state,
          writtenAt: this.now(),
          settlesAt: this.now() + SETTLE_MS,
          previousModelConfig:
            current.observedModelConfig ?? current.modelConfig,
          // A model that resolves again makes a failed agent ready.
          settledState:
            next.modelConfig !== agent.modelConfig && settling === 'failed'
              ? 'ready'
              : settling,
        },
      );
      this.changed();
    }
    return {
      agent: this.getAgent(installation, agent.namespace, agent.name),
      before,
      after,
      changed,
      manifests: validation.manifests,
      requestedBy: FIXTURE_USER.email,
    };
  }

  deleteAgent(
    installation: string,
    namespace: string,
    name: string,
    mode?: string,
  ): DeleteAgentResult {
    mustBeLive(mode);
    this.mustCreateAgentsIn(this.writableIn(installation, namespace));
    const agent = this.stored(installation, namespace, name);
    this.stateOf(installation).agents.delete(keyOf(namespace, name));
    this.changed();
    const others = this.agentsIn(installation, namespace);
    return {
      name,
      namespace,
      helmReleaseDeleted: true,
      agentDeleted: agent.release === 'ready',
      remoteMcpServerDeleted: agent.release === 'ready',
      ociRepositoryDeleted: others.length === 0,
      ...(others.length > 0 && {
        ociRepositoryKept: `${others.length} other releases of ${namespace} reference it`,
      }),
      requestedBy: FIXTURE_USER.email,
    };
  }

  /**
   * Starts a session: creates it in kagent's fixture, which serves it from
   * then on, and answers its id.
   */
  startSession(
    installation: string,
    request: StartSessionRequest & { noWorkspace?: boolean },
  ): StartSessionResult {
    const agent = this.view(
      this.stored(installation, request.namespace, request.name),
    );
    if (agent.state !== 'ready') {
      throw refusal(
        'conflict',
        `${request.name} is not ready, so it cannot start sessions`,
      );
    }
    return this.once(installation, 'start_session', request.requestId, () => {
      const id = globalThis.crypto.randomUUID();
      this.kagent().createSession(installation, {
        id,
        agent: { namespace: request.namespace, name: request.name },
        ...(request.sessionName && { name: request.sessionName }),
      });
      return {
        session: {
          id,
          contextId: id,
          ...(request.sessionName && { name: request.sessionName }),
        },
        ...(request.workspaceGrant && { workspace: request.workspaceGrant }),
      };
    });
  }

  /**
   * The namespaces kagent lists Agents in for the person: their
   * organizations' namespaces that hold an agent.
   */
  agentNamespaces(installation: string): string[] {
    const state = this.stateOf(installation);
    const member = new Set(
      state.organizations
        .filter(organization => organization.role !== 'none')
        .map(organization => organization.namespace),
    );
    return [
      ...new Set(
        [...state.agents.values()]
          .map(agent => agent.namespace)
          .filter(namespace => member.has(namespace)),
      ),
    ].sort();
  }

  // The Kubernetes API

  /**
   * The installation's agent-platform objects as its Kubernetes API lists
   * them: each organization namespace's Harness and models, each agent's
   * Agent and carrier. The same array while nothing changed, so a reader can
   * tell by identity.
   */
  kubernetesObjectsOf(installation: string): KubeObjectInterface[] {
    const state = this.stateOf(installation);
    const now = this.now();
    const cached = this.objectsCache.get(installation);
    if (
      cached &&
      cached.revision === this.revision &&
      now < cached.validUntil
    ) {
      return cached.objects;
    }
    const at = this.createdAt;
    const objects: KubeObjectInterface[] = [
      ...state.organizations.flatMap(organization =>
        organization.namespace
          ? [harnessObjectOf(organization.namespace, at)]
          : [],
      ),
      ...[...state.models.values()].map(model =>
        modelConfigObjectOf(model, at),
      ),
      ...[...state.agents.values()].flatMap(stored => {
        const agent = this.view(stored);
        const created = stored.createdAt ?? at;
        return [
          agentObjectOf(agent, created),
          carrierObjectOf(agent, created),
        ].filter((object): object is NonNullable<typeof object> =>
          Boolean(object),
        );
      }),
    ] as KubeObjectInterface[];
    const upcoming = [
      ...[...state.agents.values()].map(agent => agent.settlesAt ?? 0),
      ...[...state.erasing.values()].map(
        since => since + ERASURE_STEPS.length * SETTLE_MS,
      ),
    ].filter(time => time > now);
    this.objectsCache.set(installation, {
      revision: this.revision,
      validUntil: upcoming.length > 0 ? Math.min(...upcoming) : Infinity,
      objects,
    });
    return objects;
  }
}

/** The connectors (RemoteMCPServers) every organization has. */
function connectorsOf(): OrganizationConnector[] {
  return [
    {
      name: 'issue-tracker',
      url: 'https://issues.example.com/mcp',
      description: 'Reads and comments on the issues of the team.',
      credentials: [
        {
          header: 'Authorization',
          secret: 'issue-tracker-token',
          key: 'token',
        },
      ],
    },
    {
      name: 'docs-search',
      url: 'https://docs.example.com/mcp',
      description: 'Searches the platform documentation.',
      credentials: [],
      curated: true,
      managedBy: 'agent-platform',
    },
  ];
}

/** The EgressPolicies every organization namespace has. */
function egressPoliciesOf(namespace: string): AgentManagerEgressPolicy[] {
  return [
    {
      name: 'package-registry',
      namespace,
      destinations: [
        {
          origin: 'https://registry.example.com:443',
          credentialHeader: 'Authorization',
        },
      ],
    },
  ];
}

let state: AgentManagerFixtureState | undefined;

/** The state every agent-manager fixture reads: built on first use. */
export function agentManagerFixtureState(): AgentManagerFixtureState {
  state ??= new AgentManagerFixtureState();
  return state;
}
