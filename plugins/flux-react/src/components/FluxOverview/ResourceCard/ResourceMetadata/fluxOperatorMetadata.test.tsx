import { screen } from '@testing-library/react';
import { renderInTestApp } from '@backstage/test-utils';
import {
  FluxInstance,
  FluxReport,
  ResourceSet,
  ResourceSetInputProvider,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { ResourceMetadata } from './ResourceMetadata';

const READY = {
  type: 'Ready',
  status: 'True',
  reason: 'ReconciliationSucceeded',
  message: 'Reconciliation finished in 2s',
  lastTransitionTime: '2026-10-05T10:00:00Z',
};

const HISTORY = [
  {
    digest: 'sha256:2',
    firstReconciled: '2026-10-01T10:00:00Z',
    lastReconciled: '2026-10-05T10:00:00Z',
    lastReconciledDuration: '1.5s',
    lastReconciledStatus: 'ReconciliationSucceeded',
    totalReconciliations: 12,
  },
];

function create<T>(
  ResourceClass: new (json: any, cluster: string) => T,
  kind: string,
  json: {
    annotations?: Record<string, string>;
    spec?: unknown;
    status?: unknown;
  },
): T {
  return new ResourceClass(
    {
      apiVersion: 'fluxcd.controlplane.io/v1',
      kind,
      metadata: {
        name: 'flux',
        namespace: 'flux-system',
        annotations: json.annotations,
      },
      spec: json.spec,
      status: json.status,
    },
    'test-installation',
  );
}

describe('ResourceMetadata for Flux Operator kinds', () => {
  it('shows a FluxInstance distribution, sync and last run', async () => {
    const instance = create(FluxInstance, 'FluxInstance', {
      spec: {
        distribution: { version: '2.7.x', registry: 'ghcr.io/fluxcd' },
        components: ['source-controller', 'kustomize-controller'],
        cluster: { type: 'kubernetes', multitenant: true },
        sync: {
          kind: 'GitRepository',
          url: 'https://github.com/example/fleet',
          ref: 'refs/heads/main',
          path: 'clusters/prod',
        },
      },
      status: {
        conditions: [READY],
        history: HISTORY,
        lastAppliedRevision: 'v2.7.2@sha256:abc',
      },
    });

    await renderInTestApp(<ResourceMetadata resource={instance} />);

    expect(screen.getByText('2.7.x')).toBeInTheDocument();
    expect(
      screen.getByText('source-controller, kustomize-controller'),
    ).toBeInTheDocument();
    expect(screen.getByText('kubernetes, multi-tenant')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'https://github.com/example/fleet' }),
    ).toBeInTheDocument();
    expect(screen.getByText('v2.7.2@sha256:abc')).toBeInTheDocument();
    expect(screen.getByText(/took 1.5s/)).toBeInTheDocument();
  });

  it('shows a ResourceSet input setup and who suspended it', async () => {
    const resourceSet = create(ResourceSet, 'ResourceSet', {
      annotations: {
        'fluxcd.controlplane.io/reconcile': 'disabled',
        'fluxcd.controlplane.io/suspendedBy': 'jane@example.com',
      },
      spec: {
        inputs: [{ tenant: 'a' }, { tenant: 'b' }],
        inputsFrom: [
          { name: 'branches' },
          { selector: { matchLabels: { team: 'a' } } },
        ],
        serviceAccountName: 'flux-tenant',
      },
      status: {
        conditions: [READY],
        inventory: {
          entries: [
            { id: 'a', v: 'v1' },
            { id: 'b', v: 'v1' },
          ],
        },
      },
    });

    await renderInTestApp(<ResourceMetadata resource={resourceSet} />);

    expect(screen.getByText('Flatten')).toBeInTheDocument();
    expect(screen.getByText('branches, by label selector')).toBeInTheDocument();
    expect(screen.getByText('flux-tenant')).toBeInTheDocument();
    expect(screen.getByText('Managed Objects')).toBeInTheDocument();
    expect(screen.getByText('jane@example.com')).toBeInTheDocument();
  });

  it('shows a ResourceSetInputProvider type, filter and schedule', async () => {
    const provider = create(
      ResourceSetInputProvider,
      'ResourceSetInputProvider',
      {
        spec: {
          type: 'GitHubPullRequest',
          url: 'https://github.com/example/app',
          filter: { labels: ['deploy/preview'], limit: 10 },
          schedule: [{ cron: '0 8 * * 1-5', timeZone: 'Europe/Berlin' }],
        },
        status: {
          conditions: [READY],
          exportedInputs: [{ id: '1' }, { id: '2' }, { id: '3' }],
        },
      },
    );

    await renderInTestApp(<ResourceMetadata resource={provider} />);

    expect(screen.getByText('GitHubPullRequest')).toBeInTheDocument();
    expect(
      screen.getByText('labels deploy/preview, at most 10'),
    ).toBeInTheDocument();
    expect(screen.getByText('0 8 * * 1-5 (Europe/Berlin)')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('summarises a FluxReport', async () => {
    const report = create(FluxReport, 'FluxReport', {
      spec: {
        distribution: {
          version: 'v2.6.4',
          status: 'Installed',
          entitlement: 'Unknown',
          managedBy: 'flux-app',
        },
        operator: {
          version: 'v0.60.0',
          platform: 'linux/amd64',
          apiVersion: 'v1',
        },
        cluster: {
          serverVersion: 'v1.33.4',
          platform: 'linux/amd64',
          nodes: 5,
        },
        components: [
          {
            name: 'source-controller',
            image: 'x',
            ready: true,
            status: 'Current',
          },
          {
            name: 'helm-controller',
            image: 'y',
            ready: false,
            status: 'Failed',
          },
        ],
        reconcilers: [
          {
            apiVersion: 'helm.toolkit.fluxcd.io/v2',
            kind: 'HelmRelease',
            stats: { running: 40, failing: 2, suspended: 1 },
          },
          {
            apiVersion: 'kustomize.toolkit.fluxcd.io/v1',
            kind: 'Kustomization',
            stats: { running: 10, failing: 0, suspended: 0 },
          },
        ],
      },
      status: { conditions: [READY] },
    });

    await renderInTestApp(<ResourceMetadata resource={report} />);

    expect(screen.getByText('v2.6.4')).toBeInTheDocument();
    expect(screen.getByText('flux-app')).toBeInTheDocument();
    expect(
      screen.getByText('v1.33.4, linux/amd64, 5 nodes'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('1 of 2 ready, not ready: helm-controller'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('50 running, 2 failing, 1 suspended'),
    ).toBeInTheDocument();
    expect(screen.getByText('HelmRelease (2)')).toBeInTheDocument();
  });
});
