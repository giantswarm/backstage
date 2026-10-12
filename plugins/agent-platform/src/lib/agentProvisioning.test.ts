import {
  Agent,
  type AgentCondition,
  type AgentInterface,
} from '@giantswarm/backstage-plugin-kubernetes-react';

import type { AgentStatus } from './agentManager';
import {
  agentSettingUpUntil,
  backoffRefetchInterval,
  isTerminalAgentStatus,
  PROVISIONING_GRACE_MS,
} from './agentProvisioning';

const CHANGED_AT = '2026-07-31T12:00:00Z';

function condition(
  type: string,
  status: 'True' | 'False',
  reason: string,
  message = '',
): AgentCondition {
  return { type, status, reason, message, lastTransitionTime: CHANGED_AT };
}

function agentWith(conditions: AgentCondition[]): Agent {
  return new Agent(
    {
      apiVersion: 'api.kagent.dev/v1alpha3',
      kind: 'Agent',
      metadata: {
        name: 'adhoc',
        namespace: 'kagent',
        generation: 1,
        creationTimestamp: CHANGED_AT,
      },
      spec: { harnessRef: { name: 'kagent' }, template: {} },
      status: { observedGeneration: 1, conditions },
    } as AgentInterface,
    'gazelle',
  );
}

describe('backoffRefetchInterval', () => {
  it('doubles every minute, up to the maximum', () => {
    expect(backoffRefetchInterval(0, 5_000, 60_000)).toBe(5_000);
    expect(backoffRefetchInterval(59_999, 5_000, 60_000)).toBe(5_000);
    expect(backoffRefetchInterval(60_000, 5_000, 60_000)).toBe(10_000);
    expect(backoffRefetchInterval(3 * 60_000, 5_000, 60_000)).toBe(40_000);
    expect(backoffRefetchInterval(4 * 60_000, 5_000, 60_000)).toBe(60_000);
    expect(backoffRefetchInterval(60 * 60_000, 5_000, 60_000)).toBe(60_000);
  });

  it('starts at the initial interval for a clock that ran backwards', () => {
    expect(backoffRefetchInterval(-1_000, 5_000, 60_000)).toBe(5_000);
  });
});

describe('agentSettingUpUntil', () => {
  it('gives an unresolved reference the grace period from its last change', () => {
    const agent = agentWith([
      condition('Accepted', 'True', 'Admitted'),
      condition(
        'ResolvedRefs',
        'False',
        'ReferenceResolutionFailed',
        'resolve RemoteMCPServer "adhoc": not found',
      ),
      condition('Compatible', 'False', 'Blocked', 'blocked by ResolvedRefs'),
    ]);

    expect(agentSettingUpUntil(agent)).toBe(
      Date.parse(CHANGED_AT) + PROVISIONING_GRACE_MS,
    );
  });

  it('gives a configuration the Harness rejects none: waiting does not fix it', () => {
    const agent = agentWith([
      condition('Accepted', 'True', 'Admitted'),
      condition('ResolvedRefs', 'True', 'Resolved'),
      condition('Compatible', 'False', 'Incompatible', 'needs a sandbox'),
    ]);

    expect(agentSettingUpUntil(agent)).toBeUndefined();
  });

  it('gives a template the Harness does not accept none', () => {
    const agent = agentWith([
      condition('Accepted', 'False', 'UnsupportedKind'),
      condition('ResolvedRefs', 'False', 'Blocked', 'blocked by Accepted'),
    ]);

    expect(agentSettingUpUntil(agent)).toBeUndefined();
  });

  it('gives an agent that is not failed none', () => {
    const agent = agentWith([
      condition('Accepted', 'True', 'Admitted'),
      condition('Ready', 'True', 'RevisionReady'),
    ]);

    expect(agentSettingUpUntil(agent)).toBeUndefined();
  });
});

describe('isTerminalAgentStatus', () => {
  const status = (extra: Partial<AgentStatus>): AgentStatus => ({
    name: 'adhoc',
    namespace: 'kagent',
    verdict: 'failed',
    summary: '',
    ...extra,
  });
  const agent = (
    extra: Partial<NonNullable<AgentStatus['agent']>>,
  ): AgentStatus['agent'] => ({
    exists: true,
    ready: false,
    accepted: true,
    resolvedRefs: true,
    compatible: true,
    ...extra,
  });
  const release = (
    extra: Partial<NonNullable<AgentStatus['helmRelease']>>,
  ): AgentStatus['helmRelease'] => ({
    exists: true,
    ready: false,
    suspended: false,
    gitOpsOwned: false,
    deleting: false,
    ...extra,
  });

  it('reads a release not ready yet, and unresolved references, as not terminal', () => {
    expect(isTerminalAgentStatus(status({ helmRelease: release({}) }))).toBe(
      false,
    );
    expect(
      isTerminalAgentStatus(
        status({ agent: agent({ resolvedRefs: false, compatible: false }) }),
      ),
    ).toBe(false);
  });

  it('reads a suspended or deleting release as terminal', () => {
    expect(
      isTerminalAgentStatus(
        status({ helmRelease: release({ suspended: true }) }),
      ),
    ).toBe(true);
    expect(
      isTerminalAgentStatus(
        status({ helmRelease: release({ deleting: true }) }),
      ),
    ).toBe(true);
  });

  it('reads a rejection by the Harness as terminal', () => {
    expect(
      isTerminalAgentStatus(status({ agent: agent({ accepted: false }) })),
    ).toBe(true);
    expect(
      isTerminalAgentStatus(status({ agent: agent({ compatible: false }) })),
    ).toBe(true);
  });
});
