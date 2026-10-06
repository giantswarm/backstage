import type { Page, Route } from '@playwright/test';

import { expect, open, test, watchPageErrors } from './fixtures';
import { lab } from './lab';

/**
 * The cluster page of a cluster a Flux HelmRelease installs, as every cluster
 * cluster-manager's `create_cluster` makes is: no App CR
 * (giantswarm/backstage#2740).
 *
 * The lab's kind cluster serves neither the Cluster API nor Giant Swarm's App
 * CRD, so the reads of the fixture clusters are answered at the browser: the
 * `cluster.x-k8s.io` and (for the App-based cluster) `application.giantswarm.io`
 * discovery, and each fixture object. The HelmRelease API's discovery is the
 * lab's own Flux; only the fixture HelmRelease's GET is answered here.
 */
const NAMESPACE = 'org-lab';

type Group = { group: string; version: string; kind: string; plural: string };

const CLUSTER_API: Group = {
  group: 'cluster.x-k8s.io',
  version: 'v1beta2',
  kind: 'Cluster',
  plural: 'clusters',
};
const APP_API: Group = {
  group: 'application.giantswarm.io',
  version: 'v1alpha1',
  kind: 'App',
  plural: 'apps',
};
const HELM_API = { group: 'helm.toolkit.fluxcd.io', version: 'v2' };

const cluster = (name: string) => ({
  apiVersion: `${CLUSTER_API.group}/${CLUSTER_API.version}`,
  kind: 'Cluster',
  metadata: {
    name,
    namespace: NAMESPACE,
    labels: {
      'giantswarm.io/organization': 'lab',
      'release.giantswarm.io/version': '33.1.0',
      'cluster.x-k8s.io/cluster-name': name,
    },
    annotations: { 'cluster.giantswarm.io/description': `e2e ${name}` },
    creationTimestamp: '2026-10-06T10:00:00Z',
  },
  spec: {},
  status: { phase: 'Provisioned' },
});

const app = (name: string) => ({
  apiVersion: `${APP_API.group}/${APP_API.version}`,
  kind: 'App',
  metadata: { name, namespace: NAMESPACE },
  spec: { name: 'cluster-aws', namespace: NAMESPACE, version: '3.1.0' },
  status: { release: { status: 'deployed' }, version: '3.1.0' },
});

const helmRelease = (name: string, ready: boolean) => ({
  apiVersion: `${HELM_API.group}/${HELM_API.version}`,
  kind: 'HelmRelease',
  metadata: {
    name,
    namespace: NAMESPACE,
    labels: { 'app.kubernetes.io/managed-by': 'cluster-manager' },
  },
  spec: {
    interval: '10m',
    chart: {
      spec: {
        chart: 'cluster-aws',
        version: '3.1.0',
        sourceRef: { kind: 'HelmRepository', name: 'cluster' },
      },
    },
  },
  status: {
    history: ready
      ? [{ chartVersion: '3.1.0', lastDeployed: '2026-10-06T10:05:00Z' }]
      : [],
    conditions: [
      ready
        ? {
            type: 'Ready',
            status: 'True',
            reason: 'InstallSucceeded',
            message: 'Helm install succeeded for release org-lab/' + name,
            lastTransitionTime: '2026-10-06T10:05:00Z',
          }
        : {
            type: 'Ready',
            status: 'False',
            reason: 'InstallFailed',
            message: 'Helm install failed: values do not match the schema',
            lastTransitionTime: '2026-10-06T10:05:00Z',
          },
    ],
  },
});

const notFound = (plural: string, name: string) => ({
  kind: 'Status',
  apiVersion: 'v1',
  status: 'Failure',
  message: `${plural} "${name}" not found`,
  reason: 'NotFound',
  code: 404,
});

/** Answers discovery of `groups` and the GETs of `objects` (path → body, `null` a 404). */
async function stage(
  page: Page,
  groups: Group[],
  objects: Record<string, unknown>,
): Promise<string[]> {
  const reads: string[] = [];
  await page.route('**/api/kubernetes/proxy/**', async (route: Route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname
      .replace(/^.*\/api\/kubernetes\/proxy/, '')
      .replace(/\/$/, '');
    if (
      request.method() !== 'GET' ||
      request.headers()['backstage-kubernetes-cluster'] !== lab.installation
    ) {
      await route.fallback();
      return;
    }
    for (const g of groups) {
      if (path === `/apis/${g.group}`) {
        const gv = {
          groupVersion: `${g.group}/${g.version}`,
          version: g.version,
        };
        await route.fulfill({
          json: {
            kind: 'APIGroup',
            apiVersion: 'v1',
            name: g.group,
            versions: [gv],
            preferredVersion: gv,
          },
        });
        return;
      }
      if (path === `/apis/${g.group}/${g.version}`) {
        await route.fulfill({
          json: {
            kind: 'APIResourceList',
            apiVersion: 'v1',
            groupVersion: `${g.group}/${g.version}`,
            resources: [
              {
                name: g.plural,
                singularName: g.kind.toLowerCase(),
                namespaced: true,
                kind: g.kind,
                verbs: ['get', 'list', 'watch'],
              },
            ],
          },
        });
        return;
      }
    }
    if (path in objects) {
      reads.push(path);
      const body = objects[path];
      const name = path.split('/').pop()!;
      const plural = path.split('/').slice(-2)[0];
      await route.fulfill(
        body === null
          ? { status: 404, json: notFound(plural, name) }
          : { json: body },
      );
      return;
    }
    await route.fallback();
  });
  return reads;
}

const clusterPath = (name: string) =>
  `/apis/${CLUSTER_API.group}/${CLUSTER_API.version}/namespaces/${NAMESPACE}/clusters/${name}`;
const appPath = (name: string) =>
  `/apis/${APP_API.group}/${APP_API.version}/namespaces/${NAMESPACE}/apps/${name}`;
const helmReleasePath = (name: string) =>
  `/apis/${HELM_API.group}/${HELM_API.version}/namespaces/${NAMESPACE}/helmreleases/${name}`;

const clusterPage = (name: string) =>
  `/clusters/${lab.installation}/${NAMESPACE}/${name}`;

test.describe('clusters: a cluster a HelmRelease installs', () => {
  test('opens its Overview with the release, chart, version and status', async ({
    page,
  }) => {
    const name = 'wc-flux';
    await stage(page, [CLUSTER_API], {
      [clusterPath(name)]: cluster(name),
      [helmReleasePath(name)]: helmRelease(name, true),
    });
    const errors = watchPageErrors(page);

    await open(page, clusterPage(name));

    await expect(page.getByText('Installed by', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name, exact: true })).toBeVisible();
    await expect(page.getByText('cluster-aws', { exact: true })).toBeVisible();
    await expect(page.getByText('3.1.0', { exact: true })).toBeVisible();
    await expect(page.getByText('Successful', { exact: true })).toBeVisible();
    await expect(
      page.getByText(/apps\.application\.giantswarm\.io/),
    ).toHaveCount(0);
    await expect(page.getByText(/outside of an ClusterLayout/)).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("shows a release's Ready message while it is not ready", async ({
    page,
  }) => {
    const name = 'wc-flux-failed';
    await stage(page, [CLUSTER_API], {
      [clusterPath(name)]: cluster(name),
      [helmReleasePath(name)]: helmRelease(name, false),
    });

    await open(page, clusterPage(name));

    await expect(page.getByText('Installed by', { exact: true })).toBeVisible();
    await expect(page.getByText('Failed', { exact: true })).toBeVisible();
    await expect(
      page.getByText('Helm install failed: values do not match the schema'),
    ).toBeVisible();
  });

  test("shows the release's conditions while its Cluster does not exist yet", async ({
    page,
  }) => {
    const name = 'wc-flux-creating';
    await stage(page, [CLUSTER_API], {
      [clusterPath(name)]: null,
      [helmReleasePath(name)]: helmRelease(name, true),
    });

    await open(page, clusterPage(name));

    await expect(
      page.getByText('Cluster creation is in progress.'),
    ).toBeVisible();
    await expect(
      page.getByText(/cluster HelmRelease\s+resource status/),
    ).toBeVisible();
    await expect(page.getByText('Conditions')).toBeVisible();
  });

  test('leaves the page of an App-based cluster unchanged', async ({
    page,
  }) => {
    const name = 'wc-app';
    const reads = await stage(page, [CLUSTER_API, APP_API], {
      [clusterPath(name)]: cluster(name),
      [appPath(name)]: app(name),
      [helmReleasePath(name)]: helmRelease(name, true),
    });

    await open(page, clusterPage(name));

    await expect(page.getByText('e2e wc-app')).toBeVisible();
    await expect(page.getByText('Installed by', { exact: true })).toHaveCount(
      0,
    );
    expect(reads).not.toContain(helmReleasePath(name));
  });
});
