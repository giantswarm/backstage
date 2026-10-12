import {
  Agent,
  HelmRelease,
  type AgentCondition,
  type AgentInterface,
} from '@giantswarm/backstage-plugin-kubernetes-react';

import {
  backoffRefetchInterval,
  displayReadinessOf,
  isOwnCarrierMissing,
  PROVISIONING_GRACE_MS,
  settingUpUntil,
} from './agentProvisioning';

const CREATED_AT = '2026-07-31T12:00:00Z';
const UNTIL = Date.parse(CREATED_AT) + PROVISIONING_GRACE_MS;
const OWN_CARRIER = 'resolve RemoteMCPServer "adhoc": not found';

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

/** Failed on `message` as the ResolvedRefs root cause. */
const unresolved = (message: string, created?: string | null) =>
  agentWith(
    [
      condition('Accepted', 'True', 'Admitted'),
      condition('ResolvedRefs', 'False', 'ReferenceResolutionFailed', message),
      condition('Compatible', 'False', 'Blocked', 'blocked by ResolvedRefs'),
    ],
    created,
  );

const compiling = () =>
  agentWith([
    condition('Accepted', 'True', 'Admitted'),
    condition('Ready', 'False', 'Compiling'),
  ]);

function releaseWith(
  conditions: Array<{ type: string; status: string; reason: string }>,
  {
    suspend = false,
    created = CREATED_AT as string | null,
  }: { suspend?: boolean; created?: string | null } = {},
): HelmRelease {
  return new HelmRelease(
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
}

const ready = (status: string, reason: string) => [
  { type: 'Ready', status, reason },
];

describe('backoffRefetchInterval', () => {
  it('doubles every minute, up to the maximum', () => {
    expect(backoffRefetchInterval(0, 5_000, 60_000)).toBe(5_000);
    expect(backoffRefetchInterval(59_999, 5_000, 60_000)).toBe(5_000);
    expect(backoffRefetchInterval(60_000, 5_000, 60_000)).toBe(10_000);
    expect(backoffRefetchInterval(3 * 60_000, 5_000, 60_000)).toBe(40_000);
    expect(backoffRefetchInterval(4 * 60_000, 5_000, 60_000)).toBe(60_000);
  });

  it('starts at the initial interval for a negative elapsed time', () => {
    expect(backoffRefetchInterval(-1_000, 5_000, 60_000)).toBe(5_000);
  });
});

describe('isOwnCarrierMissing', () => {
  it('matches the agent’s own server alone, bare or namespaced', () => {
    expect(isOwnCarrierMissing(OWN_CARRIER, 'kagent', 'adhoc')).toBe(true);
    expect(
      isOwnCarrierMissing(
        'resolve RemoteMCPServer "kagent/adhoc": not found',
        'kagent',
        'adhoc',
      ),
    ).toBe(true);
  });

  // kagent puts every unresolved reference in one message; one that also
  // names something else the release does not create is a failure.
  it('matches no message that names anything else as well', () => {
    for (const message of [
      `${OWN_CARRIER}; resolve ModelConfig "gpt": not found`,
      `resolve ModelConfig "gpt": not found; ${OWN_CARRIER}`,
      'resolve RemoteMCPServer "adhoc-2": not found',
      'resolve RemoteMCPServer "other/adhoc": not found',
      'resolve ModelConfig "adhoc": not found',
      'resolve RemoteMCPServer "adhoc": unreachable',
      undefined,
    ]) {
      expect(isOwnCarrierMissing(message, 'kagent', 'adhoc')).toBe(false);
    }
  });
});

describe('settingUpUntil', () => {
  describe('from the Agent alone', () => {
    it('gives a new agent missing only its own server the window from its creation', () => {
      expect(settingUpUntil({ agent: unresolved(OWN_CARRIER) })).toBe(UNTIL);
    });

    // The window is the agent's age, not its activity.
    it('does not restart the window on a later condition change', () => {
      const agent = agentWith([
        condition('Accepted', 'True', 'Admitted'),
        condition(
          'ResolvedRefs',
          'False',
          'ReferenceResolutionFailed',
          OWN_CARRIER,
        ),
        {
          ...condition('Ready', 'False', 'Blocked', 'blocked by ResolvedRefs'),
          lastTransitionTime: '2026-07-31T13:00:00Z',
        },
      ]);

      expect(settingUpUntil({ agent })).toBe(UNTIL);
    });

    it('gives any other failure none', () => {
      for (const agent of [
        unresolved('resolve ModelConfig "opus": not found'),
        unresolved(`${OWN_CARRIER}; resolve ModelConfig "gpt": not found`),
        unresolved('resolve ModelConfig "opus": secret has no key "apiKey"'),
        agentWith([
          condition('Accepted', 'True', 'Admitted'),
          condition('ResolvedRefs', 'True', 'Resolved'),
          condition('Compatible', 'False', 'Incompatible', 'needs a sandbox'),
        ]),
        agentWith([
          condition('Accepted', 'False', 'UnsupportedKind'),
          condition('ResolvedRefs', 'False', 'Blocked', 'blocked by Accepted'),
        ]),
      ]) {
        expect(settingUpUntil({ agent })).toBeUndefined();
      }
    });

    it('gives an agent that has not failed, or has no creation timestamp, none', () => {
      expect(settingUpUntil({ agent: compiling() })).toBeUndefined();
      expect(
        settingUpUntil({ agent: unresolved(OWN_CARRIER, null) }),
      ).toBeUndefined();
    });
  });

  describe('from the HelmRelease alone', () => {
    it('gives a new release that has not reconciled yet the window from its creation', () => {
      expect(settingUpUntil({ release: releaseWith([]) })).toBe(UNTIL);
      for (const reason of [
        'Progressing',
        'DependencyNotReady',
        // Still fetching the chart it was applied together with.
        'SourceNotReady',
        'ArtifactFailed',
      ]) {
        expect(
          settingUpUntil({ release: releaseWith(ready('False', reason)) }),
        ).toBe(UNTIL);
      }
      expect(
        settingUpUntil({
          release: releaseWith(ready('Unknown', 'Progressing')),
        }),
      ).toBe(UNTIL);
    });

    it('gives a failed, stalled, suspended, ready or undated release none', () => {
      for (const release of [
        releaseWith(ready('False', 'InstallFailed')),
        releaseWith(ready('False', 'UpgradeFailed')),
        releaseWith(ready('False', 'Whatever')),
        releaseWith([
          ...ready('Unknown', 'Progressing'),
          { type: 'Stalled', status: 'True', reason: 'RetriesExceeded' },
        ]),
        releaseWith([], { suspend: true }),
        releaseWith(ready('True', 'InstallSucceeded')),
        releaseWith([], { created: null }),
      ]) {
        expect(settingUpUntil({ release })).toBeUndefined();
      }
    });
  });

  describe('from both', () => {
    // After the release renders the Agent, helm-controller may still be
    // waiting on the release's resources.
    it('keeps the window while the release still reconciles under a rendered Agent', () => {
      expect(
        settingUpUntil({
          agent: compiling(),
          release: releaseWith(ready('Unknown', 'Progressing')),
        }),
      ).toBe(UNTIL);
    });

    it('closes it as soon as either part has failed', () => {
      expect(
        settingUpUntil({
          agent: unresolved(OWN_CARRIER),
          release: releaseWith(ready('False', 'InstallFailed')),
        }),
      ).toBeUndefined();
      expect(
        settingUpUntil({
          agent: unresolved('resolve ModelConfig "opus": not found'),
          release: releaseWith(ready('Unknown', 'Progressing')),
        }),
      ).toBeUndefined();
    });

    it('has nothing to wait for once the release is ready and the Agent has not failed', () => {
      expect(
        settingUpUntil({
          agent: compiling(),
          release: releaseWith(ready('True', 'InstallSucceeded')),
        }),
      ).toBeUndefined();
    });

    it('measures from the earlier creation', () => {
      expect(
        settingUpUntil({
          agent: unresolved(OWN_CARRIER, '2026-07-31T12:01:00Z'),
          release: releaseWith(ready('True', 'InstallSucceeded')),
        }),
      ).toBe(UNTIL);
    });
  });
});

describe('displayReadinessOf', () => {
  it('reads a failed agent the caller judged setting up as setting up', () => {
    expect(displayReadinessOf(unresolved(OWN_CARRIER), true)).toBe('settingUp');
    expect(displayReadinessOf(unresolved(OWN_CARRIER), false)).toBe('failed');
  });

  it('leaves an agent that has not failed as it is', () => {
    expect(displayReadinessOf(compiling(), true)).toBe('notReady');
  });
});
