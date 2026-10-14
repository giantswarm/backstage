import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { expect, open, signIn, test } from './fixtures';
import { lab } from './lab';

const run = promisify(execFile);

/**
 * Delete cluster to the end, through the lab's real cluster-manager over
 * muster as the signed-in person (giantswarm/backstage#2752): **Finish
 * removal** answered with cluster-manager's `notFound.nothingLeft` reads as
 * the removal complete, and the dialog opened again reads the cluster as
 * already removed.
 *
 * The lab has no Cluster API, so the spec serves the `Cluster` and `App`
 * kinds with minimal CRDs (the cluster page reads both) and makes one Cluster
 * held in deletion by a finalizer, with its App: what cluster-manager's second
 * pass sees while helm-controller's uninstall runs. Dropping the finalizer is
 * the uninstall finishing.
 */
const KUBECONFIG = process.env.AGENTLAB_KUBECONFIG;
const NAMESPACE = 'org-lab';
const NAME = 'e2e-gone';
const FINALIZER = 'agentlab.test/hold';

const KINDS = [
  { group: 'cluster.x-k8s.io', kind: 'Cluster', version: 'v1beta1' },
  { group: 'application.giantswarm.io', kind: 'App', version: 'v1alpha1' },
];

function crdName({ group, kind }: (typeof KINDS)[number]) {
  return `${kind.toLowerCase()}s.${group}`;
}

function crd(served: (typeof KINDS)[number]) {
  const plural = `${served.kind.toLowerCase()}s`;
  return `
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: ${crdName(served)}
  labels:
    agentlab.test/fixture: clusters-delete
spec:
  group: ${served.group}
  names:
    kind: ${served.kind}
    plural: ${plural}
    singular: ${served.kind.toLowerCase()}
  scope: Namespaced
  versions:
    - name: ${served.version}
      served: true
      storage: true
      schema:
        openAPIV3Schema:
          type: object
          x-kubernetes-preserve-unknown-fields: true
`;
}

const CLUSTER = `
apiVersion: cluster.x-k8s.io/v1beta1
kind: Cluster
metadata:
  name: ${NAME}
  namespace: ${NAMESPACE}
  finalizers:
    - ${FINALIZER}
  labels:
    app: cluster-aws
    giantswarm.io/organization: lab
    cluster.x-k8s.io/cluster-name: ${NAME}
spec: {}
---
apiVersion: application.giantswarm.io/v1alpha1
kind: App
metadata:
  name: ${NAME}
  namespace: ${NAMESPACE}
spec:
  name: cluster-aws
  namespace: ${NAMESPACE}
  version: 3.0.0
  catalog: cluster
`;

async function kubectl(args: string[], input?: string) {
  const child = run('kubectl', ['--kubeconfig', KUBECONFIG!, ...args], {
    encoding: 'utf8',
  });
  if (input !== undefined) {
    child.child.stdin?.end(input);
  }
  return child;
}

async function exists(args: string[]): Promise<boolean> {
  try {
    await kubectl(['get', ...args]);
    return true;
  } catch {
    return false;
  }
}

async function releaseCluster() {
  if (await exists(['-n', NAMESPACE, 'cluster', NAME])) {
    await kubectl([
      '-n',
      NAMESPACE,
      'patch',
      'cluster',
      NAME,
      '--type=merge',
      '-p',
      '{"metadata":{"finalizers":null}}',
    ]);
  }
}

test.describe('clusters: Delete cluster to the end', () => {
  test.skip(
    !process.env.AGENTLAB_CLUSTER_MANAGER || !KUBECONFIG,
    "needs a lab with cluster-manager 0.27.0 or newer registered in muster (AGENTLAB_CLUSTER_MANAGER=1) and kubectl access (AGENTLAB_KUBECONFIG, the lab's state/kubeconfig)",
  );

  const madeCRDs: string[] = [];

  test.beforeAll(async () => {
    for (const served of KINDS) {
      const name = crdName(served);
      if (!(await exists(['crd', name]))) {
        await kubectl(['apply', '-f', '-'], crd(served));
        await kubectl([
          'wait',
          '--for=condition=Established',
          `crd/${name}`,
          '--timeout=60s',
        ]);
        madeCRDs.push(name);
      }
    }
    await kubectl(['apply', '-f', '-'], CLUSTER);
    await kubectl(['-n', NAMESPACE, 'delete', 'cluster', NAME, '--wait=false']);
  });

  test.afterAll(async () => {
    await releaseCluster();
    await kubectl([
      '-n',
      NAMESPACE,
      'delete',
      'app.application.giantswarm.io',
      NAME,
      '--ignore-not-found',
    ]);
    for (const name of madeCRDs) {
      await kubectl(['delete', 'crd', name, '--ignore-not-found']);
    }
  });

  test('Finish removal ends in nothing left, and the dialog then reads it as removed', async ({
    page,
  }) => {
    await signIn(page, lab.users.admin);
    await open(page, `/clusters/${lab.installation}/${NAMESPACE}/${NAME}`);

    const remove = page.getByRole('button', { name: 'Delete', exact: true });
    await expect(remove).toBeVisible({ timeout: 60_000 });
    await remove.click();
    const dialog = page.getByRole('dialog');

    // The Cluster is still being removed: cluster-manager's second pass
    // writes nothing and names the next step.
    await expect(dialog.getByTestId('what-goes')).toBeVisible({
      timeout: 60_000,
    });
    await dialog.getByLabel(`Type ${NAME} to confirm`).fill(NAME);
    await dialog.getByRole('button', { name: 'Delete cluster' }).click();
    const finish = dialog.getByRole('button', { name: 'Finish removal' });
    await expect(finish).toBeVisible({ timeout: 60_000 });

    // helm-controller's uninstall finishes: the Cluster goes.
    await releaseCluster();
    await kubectl([
      '-n',
      NAMESPACE,
      'wait',
      '--for=delete',
      `cluster/${NAME}`,
      '--timeout=60s',
    ]);

    await finish.click();
    await expect(dialog.getByTestId('delete-complete')).toContainText(
      `${NAME} is removed: nothing of it is left`,
      { timeout: 60_000 },
    );
    await expect(dialog.getByText('cluster-manager refused')).toHaveCount(0);
    await expect(finish).toHaveCount(0);
    await dialog.screenshot({
      path: test.info().outputPath('removed.png'),
    });

    await dialog
      .getByRole('button', { name: 'Close', exact: true })
      .last()
      .click();
    await expect(dialog).toHaveCount(0);

    // Opened again, the dry runs answer nothing left: already removed, no
    // refusal and nothing to delete.
    await remove.click();
    await expect(dialog.getByTestId('delete-complete')).toContainText(
      `${NAME} is already removed: nothing of it is left`,
      { timeout: 60_000 },
    );
    await expect(dialog.getByTestId('delete-refused')).toHaveCount(0);
    await expect(
      dialog.getByRole('button', { name: 'Delete cluster' }),
    ).toHaveCount(0);
    await dialog.screenshot({
      path: test.info().outputPath('already-removed.png'),
    });
  });
});
