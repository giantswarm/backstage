import {
  normalizeSessionList,
  type KagentSession,
  type SessionRecordWire,
} from '@giantswarm/backstage-plugin-agent-platform-common';
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
} from '@giantswarm/backstage-plugin-kubernetes-react';

import type {
  AgentManagerAgent,
  AgentObjectStatus,
} from '../../lib/agentManager';
import {
  ORPHANED_DELETE_MERGED,
  type AgentPlatformOrganization,
  type ListedOrganization,
  type OrganizationPermissions,
} from '../../lib/organizations';
import { FIXTURE_USER } from './fixtureIdentity';

/**
 * The fixture data set's records as the agent-platform plugin's clients read
 * them (docs/fixtures.md). Each function maps one record onto the type a
 * client returns, so a change to that type breaks the fixture's build.
 */

/** The Harness every fixture agent runs on. */
export const FIXTURE_HARNESS = 'kagent';

/** The ModelConfig every fixture agent reads. */
export const FIXTURE_MODEL_CONFIG = 'default';

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
function firstFailureOf(type: string): { reason: string; message: string } {
  return type === AgentConditionType.Ready
    ? {
        reason: AGENT_BOOT_PENDING_REASON,
        message: 'The Harness is booting the revision.',
      }
    : {
        reason: 'ModelConfigNotFound',
        message: `resolve ModelConfig "${FIXTURE_MODEL_CONFIG}": not found`,
      };
}

function conditionsOf(agent: FixtureAgent, at: string): AgentCondition[] {
  const verdicts = VERDICTS[agent.state];
  if (!verdicts) {
    return [];
  }
  let failedBefore = false;
  return AGENT_CONDITION_STAGE_ORDER.map(type => {
    const status = verdicts[type];
    const condition: AgentCondition = {
      type,
      status,
      reason: type,
      lastTransitionTime: at,
      observedGeneration: 1,
    };
    if (status === 'False') {
      Object.assign(
        condition,
        failedBefore ? { reason: AGENT_BLOCKED_REASON } : firstFailureOf(type),
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
  agent: FixtureAgent,
  at: string,
): AgentInterface | undefined {
  if (agent.release === 'failed') {
    return undefined;
  }
  const conditions = conditionsOf(agent, at);
  return {
    apiVersion: 'api.kagent.dev/v1alpha3',
    kind: 'Agent',
    metadata: {
      name: agent.name,
      namespace: agent.namespace,
      generation: 1,
      creationTimestamp: at,
      annotations: { 'ui.giantswarm.io/display-name': agent.displayName },
    },
    spec: {
      template: {
        description: agent.description,
        modelConfig: { name: FIXTURE_MODEL_CONFIG },
      },
      harnessRef: { name: FIXTURE_HARNESS },
    },
    ...(conditions.length > 0 && {
      status: { observedGeneration: 1, conditions },
    }),
  };
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
export function agentManagerAgentOf(agent: FixtureAgent): AgentManagerAgent {
  const exists = agent.release === 'ready';
  const verdicts = exists ? VERDICTS[agent.state] : undefined;
  const status: AgentObjectStatus = {
    exists,
    ...(exists && { generation: 1 }),
    ...(verdicts && { observedGeneration: 1 }),
    harness: FIXTURE_HARNESS,
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
    modelConfig: FIXTURE_MODEL_CONFIG,
    ready: status.ready,
    harness: FIXTURE_HARNESS,
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

/** An organization as `get_organization` answers it. */
function platformOrganizationOf(
  organization: FixtureOrganization,
): AgentPlatformOrganization {
  const { state } = organization;
  const orphaned = state === 'orphaned' || state === 'pendingErase';
  return {
    name: organization.name,
    parent: organization.parent,
    displayName: organization.displayName,
    ...(organization.namespace && { namespace: organization.namespace }),
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

/**
 * An organization as `list_organizations` lists it: with the object
 * `get_organization` answers when the person manages it, its status only
 * otherwise.
 */
export function listedOrganizationOf(
  organization: FixtureOrganization,
): ListedOrganization {
  const details = platformOrganizationOf(organization);
  const permissions = PERMISSIONS[organization.role];
  return {
    name: organization.name,
    parent: organization.parent,
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
