import {
  Agent,
  HelmRelease,
  type AgentCondition,
  type AgentInterface,
} from '@giantswarm/backstage-plugin-kubernetes-react';

import type { AgentStatus } from './agentManager';
import {
  agentSettingUpUntil,
  backoffRefetchInterval,
  isMissingReferenceStatus,
  releaseSettingUpUntil,
  PROVISIONING_GRACE_MS,
} from './agentProvisioning';

const CREATED_AT = '2026-07-31T12:00:00Z';

function condition(
  type: string,
  status: 'True' | 'False',
  reason: string,
  message = '',
): AgentCondition {
  return { type, status, reason, message, lastTransitionTime: CREATED_AT };
}

function agentWith(
  conditions: AgentCondition[],
  /** `null` leaves the timestamp out. */
  creationTimestamp: string | null = CREATED_AT,
): Agent {
  return new Agent(
    {
      apiVersion: 'api.kagent.dev/v1alpha3',
      kind: 'Agent',
      metadata: {
        name: 'adhoc',
        namespace: 'kagent',
        generation: 1,
        creationTimestamp: creationTimestamp ?? undefined,
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
  const NOT_FOUND = 'resolve RemoteMCPServer "adhoc": not found';

  it('gives a new agent with a missing reference the grace period from its creation', () => {
    const agent = agentWith([
      condition('Accepted', 'True', 'Admitted'),
      condition(
        'ResolvedRefs',
        'False',
        'ReferenceResolutionFailed',
        NOT_FOUND,
      ),
      condition('Compatible', 'False', 'Blocked', 'blocked by ResolvedRefs'),
    ]);

    expect(agentSettingUpUntil(agent)).toBe(
      Date.parse(CREATED_AT) + PROVISIONING_GRACE_MS,
    );
  });

  // The window is the agent's age, not its activity: a condition flipping
  // later does not move it.
  it('does not restart the window on a later condition change', () => {
    const agent = agentWith([
      condition('Accepted', 'True', 'Admitted'),
      condition(
        'ResolvedRefs',
        'False',
        'ReferenceResolutionFailed',
        NOT_FOUND,
      ),
      {
        ...condition('Ready', 'False', 'Blocked', 'blocked by ResolvedRefs'),
        lastTransitionTime: '2026-07-31T13:00:00Z',
      },
    ]);

    expect(agentSettingUpUntil(agent)).toBe(
      Date.parse(CREATED_AT) + PROVISIONING_GRACE_MS,
    );
  });

  it('gives an unresolved reference that is not missing none', () => {
    const agent = agentWith([
      condition('Accepted', 'True', 'Admitted'),
      condition(
        'ResolvedRefs',
        'False',
        'ReferenceResolutionFailed',
        'resolve ModelConfig "opus": secret "llm" has no key "apiKey"',
      ),
    ]);

    expect(agentSettingUpUntil(agent)).toBeUndefined();
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
      condition(
        'Accepted',
        'False',
        'UnsupportedKind',
        'Harness "x" not found',
      ),
      condition('ResolvedRefs', 'False', 'Blocked', 'blocked by Accepted'),
    ]);

    expect(agentSettingUpUntil(agent)).toBeUndefined();
  });

  it('gives an agent without a creation timestamp none', () => {
    const agent = agentWith(
      [
        condition('Accepted', 'True', 'Admitted'),
        condition(
          'ResolvedRefs',
          'False',
          'ReferenceResolutionFailed',
          NOT_FOUND,
        ),
      ],
      null,
    );

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

describe('isMissingReferenceStatus', () => {
  const MISSING =
    'Harness kagent: ResolvedRefs is False (ReferenceResolutionFailed: resolve RemoteMCPServer "adhoc": not found)';
  const status = (extra: Partial<AgentStatus>): AgentStatus => ({
    name: 'adhoc',
    namespace: 'kagent',
    verdict: 'failed',
    summary: MISSING,
    agent: {
      exists: true,
      ready: false,
      accepted: true,
      resolvedRefs: false,
      compatible: false,
    },
    helmRelease: {
      exists: true,
      ready: false,
      suspended: false,
      gitOpsOwned: false,
      deleting: false,
    },
    ...extra,
  });

  it('recognises a missing reference', () => {
    expect(isMissingReferenceStatus(status({}))).toBe(true);
  });

  it('reads a verdict without the breakdown as a failure', () => {
    expect(
      isMissingReferenceStatus(
        status({ agent: undefined, helmRelease: undefined }),
      ),
    ).toBe(false);
  });

  it('reads a release that is not ready, without a missing reference, as a failure', () => {
    expect(
      isMissingReferenceStatus(
        status({
          summary: 'HelmRelease is not ready: install retries exhausted',
          agent: {
            exists: false,
            ready: null,
            accepted: null,
            resolvedRefs: null,
            compatible: null,
          },
        }),
      ),
    ).toBe(false);
  });

  it('reads an unresolved reference that is not missing as a failure', () => {
    expect(
      isMissingReferenceStatus(
        status({ summary: 'ResolvedRefs is False (secret has no key)' }),
      ),
    ).toBe(false);
  });

  it('reads a suspended or deleting release as a failure', () => {
    const release = status({}).helmRelease!;
    expect(
      isMissingReferenceStatus(
        status({ helmRelease: { ...release, suspended: true } }),
      ),
    ).toBe(false);
    expect(
      isMissingReferenceStatus(
        status({ helmRelease: { ...release, deleting: true } }),
      ),
    ).toBe(false);
  });

  it('reads a verdict other than failed as no missing reference', () => {
    expect(isMissingReferenceStatus(status({ verdict: 'progressing' }))).toBe(
      false,
    );
  });
});

describe('releaseSettingUpUntil', () => {
  const release = (
    conditions: Array<{ type: string; status: string; reason: string }>,
    { suspend = false, created = CREATED_AT as string | null } = {},
  ) =>
    new HelmRelease(
      {
        apiVersion: 'helm.toolkit.fluxcd.io/v2',
        kind: 'HelmRelease',
        metadata: {
          name: 'adhoc',
          namespace: 'kagent',
          creationTimestamp: created ?? undefined,
        },
        spec: { suspend },
        status: {
          conditions: conditions.map(releaseCondition => ({
            ...releaseCondition,
            message: '',
            lastTransitionTime: CREATED_AT,
          })),
        },
      } as never,
      'gazelle',
    );
  const UNTIL = Date.parse(CREATED_AT) + PROVISIONING_GRACE_MS;

  it('gives a release with no Ready condition yet the grace period from its creation', () => {
    expect(releaseSettingUpUntil(release([]))).toBe(UNTIL);
  });

  it('gives a release that is still progressing the grace period', () => {
    expect(
      releaseSettingUpUntil(
        release([{ type: 'Ready', status: 'Unknown', reason: 'Progressing' }]),
      ),
    ).toBe(UNTIL);
    expect(
      releaseSettingUpUntil(
        release([
          { type: 'Ready', status: 'False', reason: 'DependencyNotReady' },
        ]),
      ),
    ).toBe(UNTIL);
  });

  it('gives a failed install, or any other reason, none', () => {
    for (const reason of ['InstallFailed', 'UpgradeFailed', 'Whatever']) {
      expect(
        releaseSettingUpUntil(
          release([{ type: 'Ready', status: 'False', reason }]),
        ),
      ).toBeUndefined();
    }
  });

  it('gives a stalled, suspended, ready or undated release none', () => {
    expect(
      releaseSettingUpUntil(
        release([
          { type: 'Ready', status: 'Unknown', reason: 'Progressing' },
          { type: 'Stalled', status: 'True', reason: 'RetriesExceeded' },
        ]),
      ),
    ).toBeUndefined();
    expect(
      releaseSettingUpUntil(release([], { suspend: true })),
    ).toBeUndefined();
    expect(
      releaseSettingUpUntil(
        release([
          { type: 'Ready', status: 'True', reason: 'InstallSucceeded' },
        ]),
      ),
    ).toBeUndefined();
    expect(
      releaseSettingUpUntil(release([], { created: null })),
    ).toBeUndefined();
  });
});
