import { HelmRelease } from './HelmRelease';

type Condition = {
  type: string;
  status: 'True' | 'False' | 'Unknown';
  reason: string;
  message: string;
  lastTransitionTime: string;
};

type HistoryEntry = {
  chartVersion: string;
  lastDeployed: string;
  status: string;
};

const UPGRADE_ERROR =
  'Helm upgrade failed for release agentic-platform/muster-runbooks with chart muster-runbooks@0.2.15+800a0275a0f0: cannot patch "failing-pods" with kind Workflow: Workflow.muster.giantswarm.io "failing-pods" is invalid: [spec.description: Too long: may not be more than 1000 bytes]';
const ROLLBACK_MESSAGE =
  'Helm rollback to previous release agentic-platform/muster-runbooks.v53 with chart muster-runbooks@0.2.14+6a5dea276262 succeeded';

function createHelmRelease(
  options: {
    conditions?: Condition[];
    history?: HistoryEntry[];
    lastAttemptedRevision?: string;
    lastAttemptedReleaseAction?: 'install' | 'upgrade';
    hasStatus?: boolean;
  } = {},
): HelmRelease {
  const json = {
    apiVersion: 'helm.toolkit.fluxcd.io/v2',
    kind: 'HelmRelease',
    metadata: {
      name: 'muster-runbooks',
      namespace: 'flux-giantswarm',
    },
    spec: {},
    status:
      options.hasStatus === false
        ? undefined
        : {
            conditions: options.conditions,
            history: options.history,
            lastAttemptedRevision: options.lastAttemptedRevision,
            lastAttemptedReleaseAction: options.lastAttemptedReleaseAction,
          },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new HelmRelease(json as any, 'test-installation');
}

/**
 * The real-world shape this selector exists for: an upgrade failed, and the
 * rollback that remediated it has been mirrored into `Ready` verbatim, hiding the
 * error. Taken from a live HelmRelease.
 */
function failedUpgradeConditions(): Condition[] {
  return [
    {
      type: 'Reconciling',
      status: 'True',
      reason: 'ProgressingWithRetry',
      message: ROLLBACK_MESSAGE,
      lastTransitionTime: '2026-07-30T09:26:44Z',
    },
    {
      type: 'Ready',
      status: 'False',
      reason: 'RollbackSucceeded',
      message: ROLLBACK_MESSAGE,
      lastTransitionTime: '2026-07-30T09:26:44Z',
    },
    {
      type: 'Released',
      status: 'False',
      reason: 'UpgradeFailed',
      message: UPGRADE_ERROR,
      lastTransitionTime: '2026-07-30T09:25:31Z',
    },
    {
      type: 'Remediated',
      status: 'True',
      reason: 'RollbackSucceeded',
      message: ROLLBACK_MESSAGE,
      lastTransitionTime: '2026-07-30T09:26:44Z',
    },
  ];
}

describe('HelmRelease.findFailureCauseCondition', () => {
  it('returns the failing Released condition when a rollback masks the error', () => {
    const cause = createHelmRelease({
      conditions: failedUpgradeConditions(),
    }).findFailureCauseCondition();

    expect(cause).toMatchObject({
      type: 'Released',
      reason: 'UpgradeFailed',
      message: UPGRADE_ERROR,
    });
  });

  it('returns the failing Released condition when an uninstall masks the error', () => {
    // A failed *install* is remediated by an uninstall, not a rollback.
    const cause = createHelmRelease({
      conditions: [
        {
          type: 'Ready',
          status: 'False',
          reason: 'UninstallSucceeded',
          message: 'Helm uninstall for release agentic-platform/app succeeded',
          lastTransitionTime: '2026-07-30T09:26:44Z',
        },
        {
          type: 'Released',
          status: 'False',
          reason: 'InstallFailed',
          message: 'Helm install failed: timed out waiting for the condition',
          lastTransitionTime: '2026-07-30T09:25:31Z',
        },
        {
          type: 'Remediated',
          status: 'True',
          reason: 'UninstallSucceeded',
          message: 'Helm uninstall for release agentic-platform/app succeeded',
          lastTransitionTime: '2026-07-30T09:26:44Z',
        },
      ],
    }).findFailureCauseCondition();

    expect(cause).toMatchObject({ type: 'Released', reason: 'InstallFailed' });
  });

  it('returns the cause when the remediation itself failed', () => {
    // A failed remediation is reported as Remediated=False, and still mirrored
    // into Ready — so the gate must not require Remediated to be True.
    const cause = createHelmRelease({
      conditions: [
        {
          type: 'Ready',
          status: 'False',
          reason: 'RollbackFailed',
          message: 'Helm rollback failed: no revision for release',
          lastTransitionTime: '2026-07-30T09:26:44Z',
        },
        {
          type: 'Released',
          status: 'False',
          reason: 'UpgradeFailed',
          message: UPGRADE_ERROR,
          lastTransitionTime: '2026-07-30T09:25:31Z',
        },
        {
          type: 'Remediated',
          status: 'False',
          reason: 'RollbackFailed',
          message: 'Helm rollback failed: no revision for release',
          lastTransitionTime: '2026-07-30T09:26:44Z',
        },
      ],
    }).findFailureCauseCondition();

    expect(cause).toMatchObject({ type: 'Released', reason: 'UpgradeFailed' });
  });

  it('returns the failing TestSuccess condition when the release succeeded', () => {
    const cause = createHelmRelease({
      conditions: [
        {
          type: 'Ready',
          status: 'False',
          reason: 'RollbackSucceeded',
          message: ROLLBACK_MESSAGE,
          lastTransitionTime: '2026-07-30T09:26:44Z',
        },
        {
          type: 'Released',
          status: 'True',
          reason: 'UpgradeSucceeded',
          message: 'Helm upgrade succeeded for release agentic-platform/app',
          lastTransitionTime: '2026-07-30T09:25:00Z',
        },
        {
          type: 'TestSuccess',
          status: 'False',
          reason: 'TestFailed',
          message:
            'Helm test failed for release agentic-platform/app: pod smoke-test failed',
          lastTransitionTime: '2026-07-30T09:25:31Z',
        },
        {
          type: 'Remediated',
          status: 'True',
          reason: 'RollbackSucceeded',
          message: ROLLBACK_MESSAGE,
          lastTransitionTime: '2026-07-30T09:26:44Z',
        },
      ],
    }).findFailureCauseCondition();

    expect(cause).toMatchObject({ type: 'TestSuccess', reason: 'TestFailed' });
  });

  it('prefers the most recent of several failing conditions', () => {
    // A failed upgrade can leave a stale failing TestSuccess from an earlier
    // cycle behind, and vice versa.
    const conditions = (releasedAt: string, testedAt: string): Condition[] => [
      {
        type: 'Ready',
        status: 'False',
        reason: 'RollbackSucceeded',
        message: ROLLBACK_MESSAGE,
        lastTransitionTime: '2026-07-30T09:26:44Z',
      },
      {
        type: 'Released',
        status: 'False',
        reason: 'UpgradeFailed',
        message: UPGRADE_ERROR,
        lastTransitionTime: releasedAt,
      },
      {
        type: 'TestSuccess',
        status: 'False',
        reason: 'TestFailed',
        message: 'Helm test failed',
        lastTransitionTime: testedAt,
      },
      {
        type: 'Remediated',
        status: 'True',
        reason: 'RollbackSucceeded',
        message: ROLLBACK_MESSAGE,
        lastTransitionTime: '2026-07-30T09:26:44Z',
      },
    ];

    expect(
      createHelmRelease({
        conditions: conditions('2026-07-30T09:25:31Z', '2026-07-29T10:00:00Z'),
      }).findFailureCauseCondition(),
    ).toMatchObject({ type: 'Released' });

    expect(
      createHelmRelease({
        conditions: conditions('2026-07-29T10:00:00Z', '2026-07-30T09:25:31Z'),
      }).findFailureCauseCondition(),
    ).toMatchObject({ type: 'TestSuccess' });
  });

  it('returns nothing when Ready reports a newer, different failure', () => {
    // After the rollback the object failed again for a reason that never reaches
    // a release attempt. Ready no longer mirrors the remediation, so it carries
    // the current blocker and the older upgrade error must not replace it.
    const cause = createHelmRelease({
      conditions: [
        {
          type: 'Ready',
          status: 'False',
          reason: 'ArtifactFailed',
          message: 'failed to get chart source: OCIRepository is not ready',
          lastTransitionTime: '2026-07-30T09:30:00Z',
        },
        {
          type: 'Released',
          status: 'False',
          reason: 'UpgradeFailed',
          message: UPGRADE_ERROR,
          lastTransitionTime: '2026-07-30T09:25:31Z',
        },
        {
          type: 'Remediated',
          status: 'True',
          reason: 'RollbackSucceeded',
          message: ROLLBACK_MESSAGE,
          lastTransitionTime: '2026-07-30T09:26:44Z',
        },
      ],
    }).findFailureCauseCondition();

    expect(cause).toBeUndefined();
  });

  it('returns nothing when Ready already carries the failure', () => {
    // Without remediation (e.g. remediation disabled) Ready is a mirror of the
    // failing Released condition, so there is nothing to substitute.
    const cause = createHelmRelease({
      conditions: [
        {
          type: 'Ready',
          status: 'False',
          reason: 'UpgradeFailed',
          message: UPGRADE_ERROR,
          lastTransitionTime: '2026-07-30T09:25:31Z',
        },
        {
          type: 'Released',
          status: 'False',
          reason: 'UpgradeFailed',
          message: UPGRADE_ERROR,
          lastTransitionTime: '2026-07-30T09:25:31Z',
        },
      ],
    }).findFailureCauseCondition();

    expect(cause).toBeUndefined();
  });

  it('returns nothing while the release is ready', () => {
    // `spec.test.ignoreFailures` keeps a release ready with failing tests.
    const cause = createHelmRelease({
      conditions: [
        {
          type: 'Ready',
          status: 'True',
          reason: 'UpgradeSucceeded',
          message: 'Helm upgrade succeeded',
          lastTransitionTime: '2026-07-30T09:26:44Z',
        },
        {
          type: 'TestSuccess',
          status: 'False',
          reason: 'TestFailed',
          message: 'Helm test failed',
          lastTransitionTime: '2026-07-30T09:26:00Z',
        },
      ],
    }).findFailureCauseCondition();

    expect(cause).toBeUndefined();
  });

  it('returns nothing while a fresh reconciliation is in flight', () => {
    // The failing Released condition is stale, left over from a previous
    // generation, and must not be reported as the current state.
    const cause = createHelmRelease({
      conditions: [
        {
          type: 'Ready',
          status: 'Unknown',
          reason: 'Progressing',
          message: 'Running upgrade action',
          lastTransitionTime: '2026-07-30T09:30:00Z',
        },
        {
          type: 'Released',
          status: 'False',
          reason: 'UpgradeFailed',
          message: UPGRADE_ERROR,
          lastTransitionTime: '2026-07-30T09:25:31Z',
        },
      ],
    }).findFailureCauseCondition();

    expect(cause).toBeUndefined();
  });

  it('substitutes the cause when Ready only reports that the release stalled', () => {
    const stalledMessage = 'Failed to upgrade after 10 attempt(s)';
    const stalledConditions: Condition[] = [
      {
        type: 'Stalled',
        status: 'True',
        reason: 'RetriesExceeded',
        message: stalledMessage,
        lastTransitionTime: '2026-07-30T09:30:00Z',
      },
      {
        type: 'Ready',
        status: 'False',
        reason: 'RetriesExceeded',
        message: stalledMessage,
        lastTransitionTime: '2026-07-30T09:30:00Z',
      },
    ];

    expect(
      createHelmRelease({
        conditions: [
          ...stalledConditions,
          {
            type: 'Released',
            status: 'False',
            reason: 'UpgradeFailed',
            message: UPGRADE_ERROR,
            lastTransitionTime: '2026-07-30T09:25:31Z',
          },
        ],
      }).findFailureCauseCondition(),
    ).toMatchObject({ type: 'Released', reason: 'UpgradeFailed' });

    // Nothing to substitute without a failing release condition.
    expect(
      createHelmRelease({
        conditions: stalledConditions,
      }).findFailureCauseCondition(),
    ).toBeUndefined();
  });

  it('substitutes the cause when a stalled release keeps a progress placeholder', () => {
    // Observed on a live HelmRelease: helm-controller stopped retrying and left
    // the "reconciliation in progress" Ready condition behind, so Ready reports
    // neither the failure nor the stall.
    const cause = createHelmRelease({
      conditions: [
        {
          type: 'Stalled',
          status: 'True',
          reason: 'RetriesExceeded',
          message: 'Failed to upgrade after 1 attempt(s)',
          lastTransitionTime: '2026-07-30T11:33:09Z',
        },
        {
          type: 'Ready',
          status: 'Unknown',
          reason: 'Progressing',
          message: 'reconciliation in progress',
          lastTransitionTime: '2026-07-30T11:33:09Z',
        },
        {
          type: 'Released',
          status: 'False',
          reason: 'UpgradeFailed',
          message: UPGRADE_ERROR,
          lastTransitionTime: '2026-05-28T12:55:44Z',
        },
      ],
    }).findFailureCauseCondition();

    expect(cause).toMatchObject({ type: 'Released', reason: 'UpgradeFailed' });
  });

  it('handles a resource without conditions', () => {
    expect(createHelmRelease().findFailureCauseCondition()).toBeUndefined();
    expect(
      createHelmRelease({ hasStatus: false }).findFailureCauseCondition(),
    ).toBeUndefined();
    expect(
      createHelmRelease({ conditions: [] }).findFailureCauseCondition(),
    ).toBeUndefined();
  });
});

describe('HelmRelease status getters', () => {
  it('reports the chart version of the most recently deployed release', () => {
    const helmRelease = createHelmRelease({
      history: [
        {
          chartVersion: '0.2.14+6a5dea276262',
          lastDeployed: '2026-07-30T09:26:32Z',
          status: 'deployed',
        },
        {
          chartVersion: '0.2.15+800a0275a0f0',
          lastDeployed: '2026-07-30T09:26:01Z',
          status: 'failed',
        },
        {
          chartVersion: '0.2.14+6a5dea276262',
          lastDeployed: '2026-07-30T09:25:35Z',
          status: 'superseded',
        },
      ],
      lastAttemptedRevision: '0.2.15+800a0275a0f0',
      lastAttemptedReleaseAction: 'upgrade',
    });

    expect(helmRelease.getLastAppliedRevision()).toBe('0.2.14+6a5dea276262');
    expect(helmRelease.getLastAttemptedRevision()).toBe('0.2.15+800a0275a0f0');
    expect(helmRelease.getLastAttemptedReleaseAction()).toBe('upgrade');
  });

  it('finds the remediation and stalled conditions', () => {
    const helmRelease = createHelmRelease({
      conditions: failedUpgradeConditions(),
    });

    expect(helmRelease.findRemediatedCondition()).toMatchObject({
      reason: 'RollbackSucceeded',
    });
    expect(helmRelease.findStalledCondition()).toBeUndefined();
  });
});
