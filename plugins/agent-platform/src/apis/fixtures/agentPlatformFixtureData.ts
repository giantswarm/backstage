import {
  normalizeSessionList,
  type KagentSession,
  type SessionRecordWire,
} from '@giantswarm/backstage-plugin-agent-platform-common';
import type {
  AgentState,
  FixtureAgent,
  FixtureOrganization,
  FixtureSession,
} from '@giantswarm/backstage-plugin-gs-common/fixtures';
import type {
  AgentCondition,
  AgentInterface,
} from '@giantswarm/backstage-plugin-kubernetes-react';

import type {
  AgentManagerAgent,
  AgentObjectStatus,
} from '../../lib/agentManager';
import type {
  AgentPlatformOrganization,
  ListedOrganization,
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
 * The controller's conditions in each state, in its evaluation order:
 * Accepted, ResolvedRefs, Compatible, Ready. `pending` has none: the
 * controller has not looked at the agent yet.
 */
const CONDITIONS: Record<
  AgentState,
  [Verdict, Verdict, Verdict, Verdict] | undefined
> = {
  ready: ['True', 'True', 'True', 'True'],
  notReady: ['True', 'True', 'True', 'False'],
  failed: ['True', 'False', 'False', 'False'],
  pending: undefined,
};

const CONDITION_TYPES = ['Accepted', 'ResolvedRefs', 'Compatible', 'Ready'];

function reasonOf(type: string, verdict: Verdict, failedBefore: boolean) {
  if (verdict === 'True') {
    return type;
  }
  if (failedBefore) {
    return 'Blocked';
  }
  return type === 'Ready' ? 'RevisionPreparing' : 'ModelConfigNotFound';
}

function conditionsOf(agent: FixtureAgent, at: string): AgentCondition[] {
  const verdicts = CONDITIONS[agent.state];
  if (!verdicts) {
    return [];
  }
  return verdicts.map((status, index) => {
    const type = CONDITION_TYPES[index];
    const failedBefore = verdicts.slice(0, index).includes('False');
    return {
      type,
      status,
      reason: reasonOf(type, status, failedBefore),
      ...(status === 'False' &&
        !failedBefore && {
          message:
            type === 'Ready'
              ? 'The new revision is being prepared.'
              : `ModelConfig ${agent.namespace}/${FIXTURE_MODEL_CONFIG} not found.`,
        }),
      lastTransitionTime: at,
      observedGeneration: 1,
    };
  });
}

/**
 * An agent as the kagent `Agent` object the agent pages list. `at` is when
 * its conditions last changed.
 */
export function agentObjectOf(agent: FixtureAgent, at: string): AgentInterface {
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

/** An agent as agent-manager's `get_agent` reads it back. */
export function agentManagerAgentOf(agent: FixtureAgent): AgentManagerAgent {
  const [accepted, resolvedRefs, compatible, ready] =
    CONDITIONS[agent.state] ?? [];
  const status: AgentObjectStatus = {
    exists: true,
    generation: 1,
    ...(agent.state !== 'pending' && { observedGeneration: 1 }),
    harness: FIXTURE_HARNESS,
    ready: verdictOf(ready),
    accepted: verdictOf(accepted),
    resolvedRefs: verdictOf(resolvedRefs),
    compatible: verdictOf(compatible),
  };
  return {
    name: agent.name,
    namespace: agent.namespace,
    exists: true,
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
      ready: status.ready,
      suspended: false,
      gitOpsOwned: false,
      deleting: false,
    },
  };
}

/** An organization as `get_organization` answers it. */
function platformOrganizationOf(
  organization: FixtureOrganization,
): AgentPlatformOrganization {
  const { state } = organization;
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
    ...(state === 'orphaned' && {
      orphaned: {
        status: 'True',
        reason: 'Missing',
        message: 'The organization is missing from git.',
      },
    }),
    ...(state === 'deleting' && { deleting: true, erasureStep: 'sessions' }),
  };
}

/**
 * An organization as `list_organizations` lists it, for a person who
 * manages it.
 */
export function listedOrganizationOf(
  organization: FixtureOrganization,
): ListedOrganization {
  const managed = platformOrganizationOf(organization);
  return {
    name: organization.name,
    parent: organization.parent,
    displayName: organization.displayName,
    ...(organization.namespace && { namespace: organization.namespace }),
    ...(managed.orphaned && { orphaned: managed.orphaned }),
    ...(managed.deleting && { deleting: true }),
    permissions: { manage: true, member: true, createAgents: true },
    organization: managed,
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
 * Sessions as `KagentApi.listSessions` returns them: their records read by
 * the same parser the real client's answers go through.
 */
export function kagentSessionsOf(
  sessions: readonly FixtureSession[],
  installation: string,
): KagentSession[] {
  return normalizeSessionList(
    { sessions: sessions.map(sessionRecordOf) },
    installation,
  ).sessions;
}
