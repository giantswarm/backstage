import { screen } from '@testing-library/react';
import { renderInTestApp } from '@backstage/test-utils';
import {
  HelmRelease,
  Kustomization,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { ResourceMetadata } from './ResourceMetadata';

type Condition = {
  type: string;
  status: 'True' | 'False' | 'Unknown';
  reason: string;
  message: string;
  lastTransitionTime: string;
};

const UPGRADE_ERROR =
  'Helm upgrade failed for release agentic-platform/muster-runbooks with chart muster-runbooks@0.2.15+800a0275a0f0: cannot patch "failing-pods" with kind Workflow';
const ROLLBACK_MESSAGE =
  'Helm rollback to previous release agentic-platform/muster-runbooks.v53 with chart muster-runbooks@0.2.14+6a5dea276262 succeeded';

function createHelmRelease(options: {
  conditions?: Condition[];
  lastAttemptedRevision?: string;
  upgradeFailures?: number;
}): HelmRelease {
  const json = {
    apiVersion: 'helm.toolkit.fluxcd.io/v2',
    kind: 'HelmRelease',
    metadata: { name: 'muster-runbooks', namespace: 'flux-giantswarm' },
    spec: { interval: '10m' },
    status: {
      conditions: options.conditions,
      history: [
        {
          chartVersion: '0.2.14+6a5dea276262',
          lastDeployed: '2026-07-30T09:26:32Z',
          status: 'deployed',
        },
      ],
      lastAttemptedRevision: options.lastAttemptedRevision,
      lastAttemptedReleaseAction: 'upgrade',
      upgradeFailures: options.upgradeFailures,
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new HelmRelease(json as any, 'test-installation');
}

function createFailedUpgrade(): HelmRelease {
  return createHelmRelease({
    lastAttemptedRevision: '0.2.15+800a0275a0f0',
    upgradeFailures: 9,
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
  });
}

function createKustomization(readyStatus: 'True' | 'False'): Kustomization {
  const json = {
    apiVersion: 'kustomize.toolkit.fluxcd.io/v1',
    kind: 'Kustomization',
    metadata: { name: 'my-app', namespace: 'flux-system' },
    spec: { path: './apps' },
    status: {
      conditions: [
        {
          type: 'Ready',
          status: readyStatus,
          reason:
            readyStatus === 'True'
              ? 'ReconciliationSucceeded'
              : 'ReconciliationFailed',
          message: 'Applied revision main@sha1:abc',
          lastTransitionTime: '2026-07-30T09:26:44Z',
        },
      ],
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new Kustomization(json as any, 'test-installation');
}

describe('ResourceMetadata', () => {
  describe('HelmRelease with a failed upgrade', () => {
    it('shows the failing release condition instead of the rollback', async () => {
      await renderInTestApp(
        <ResourceMetadata resource={createFailedUpgrade()} />,
      );

      expect(screen.getByText(/Upgrade failed/)).toBeInTheDocument();
      expect(screen.getByText(UPGRADE_ERROR)).toBeInTheDocument();
      // The rollback message describes the previous, working release. Showing it
      // as the failure message is the bug this component must not reintroduce.
      expect(
        screen.queryByText(/Helm rollback to previous release/),
      ).not.toBeInTheDocument();
    });

    it('keeps the remediation as a single line', async () => {
      await renderInTestApp(
        <ResourceMetadata resource={createFailedUpgrade()} />,
      );

      expect(screen.getByText('Remediation')).toBeInTheDocument();
      expect(screen.getByText(/Rollback succeeded/)).toBeInTheDocument();
    });

    it('shows the attempted version next to the running one', async () => {
      await renderInTestApp(
        <ResourceMetadata resource={createFailedUpgrade()} />,
      );

      expect(screen.getByText('Chart Version')).toBeInTheDocument();
      expect(screen.getByText('0.2.14+6a5dea276262')).toBeInTheDocument();
      expect(screen.getByText('Attempted')).toBeInTheDocument();
      expect(screen.getByText('0.2.15+800a0275a0f0')).toBeInTheDocument();
      expect(screen.getByText('Upgrade Failures')).toBeInTheDocument();
    });

    it('notes when the retries are exhausted', async () => {
      const helmRelease = createHelmRelease({
        conditions: [
          {
            type: 'Stalled',
            status: 'True',
            reason: 'RetriesExceeded',
            message: 'Failed to upgrade after 10 attempt(s)',
            lastTransitionTime: '2026-07-30T09:30:00Z',
          },
          {
            type: 'Ready',
            status: 'False',
            reason: 'RetriesExceeded',
            message: 'Failed to upgrade after 10 attempt(s)',
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
      });

      await renderInTestApp(<ResourceMetadata resource={helmRelease} />);

      expect(screen.getByText(/retries exhausted/)).toBeInTheDocument();
      expect(screen.getByText(UPGRADE_ERROR)).toBeInTheDocument();
      expect(screen.queryByText('Remediation')).not.toBeInTheDocument();
    });

    it('does not claim the retries ran out on a terminal stall', async () => {
      // helm-controller stalls on errors it never retried, too. Ready is a
      // progress placeholder here, so the release error is still substituted —
      // but the wording must not assert a retry count that never happened.
      const helmRelease = createHelmRelease({
        conditions: [
          {
            type: 'Stalled',
            status: 'True',
            reason: 'InvalidChartReference',
            message: 'invalid chart reference',
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
            lastTransitionTime: '2026-07-30T09:25:31Z',
          },
        ],
      });

      await renderInTestApp(<ResourceMetadata resource={helmRelease} />);

      expect(screen.getByText(/\(stalled\)/)).toBeInTheDocument();
      expect(screen.queryByText(/retries exhausted/)).not.toBeInTheDocument();
      expect(screen.getByText(UPGRADE_ERROR)).toBeInTheDocument();
    });

    it('shows the message of a remediation that failed itself', async () => {
      const helmRelease = createHelmRelease({
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
      });

      await renderInTestApp(<ResourceMetadata resource={helmRelease} />);

      expect(screen.getByText(/Rollback failed/)).toBeInTheDocument();
      expect(screen.getByText(/no revision for release/)).toBeInTheDocument();
    });
  });

  describe('HelmRelease without a masked failure', () => {
    it('falls back to the Ready condition when it carries the failure', async () => {
      const helmRelease = createHelmRelease({
        lastAttemptedRevision: '0.2.15+800a0275a0f0',
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
      });

      await renderInTestApp(<ResourceMetadata resource={helmRelease} />);

      expect(
        screen.getByText(/Last reconciliation failed/),
      ).toBeInTheDocument();
      expect(screen.getByText(UPGRADE_ERROR)).toBeInTheDocument();
      expect(screen.queryByText('Remediation')).not.toBeInTheDocument();
      expect(screen.queryByText('Attempted')).not.toBeInTheDocument();
    });

    it('reports a ready release as reconciled', async () => {
      const helmRelease = createHelmRelease({
        conditions: [
          {
            type: 'Ready',
            status: 'True',
            reason: 'UpgradeSucceeded',
            message: 'Helm upgrade succeeded',
            lastTransitionTime: '2026-07-30T09:26:44Z',
          },
        ],
      });

      await renderInTestApp(<ResourceMetadata resource={helmRelease} />);

      expect(screen.getByText(/Last reconciled/)).toBeInTheDocument();
      expect(screen.getByText('Helm upgrade succeeded')).toBeInTheDocument();
    });
  });

  describe('other kinds', () => {
    it('keeps reporting a failing Kustomization from its Ready condition', async () => {
      await renderInTestApp(
        <ResourceMetadata resource={createKustomization('False')} />,
      );

      expect(
        screen.getByText(/Last reconciliation failed/),
      ).toBeInTheDocument();
      expect(
        screen.getByText('Applied revision main@sha1:abc'),
      ).toBeInTheDocument();
    });
  });
});
