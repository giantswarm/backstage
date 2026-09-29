import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { expect, test } from './fixtures';
import { lab } from './lab';

const run = promisify(execFile);

/**
 * The lab's kind context. The suite's other specs reach the platform only
 * through the portal; this one also needs `kubectl`, because the portal has no
 * create flow for a plain HelmRelease — the deploy template that would make one
 * lives outside this repo and is not installed in the lab.
 */
const CONTEXT = process.env.AGENTLAB_KUBE_CONTEXT ?? 'kind-agentlab';
const NAMESPACE = 'agent-platform';
const NAME = 'uninstall-test';

/**
 * A HelmRelease with no provenance markers and an `OCIRepository` of its own
 * name — the shape the portal's deploy flow produces, and the only shape the
 * Uninstall button offers itself on. Both are suspended, so the lab's
 * helm-controller never fetches the chart or installs anything: the objects
 * exist for the portal to list and delete, nothing more.
 */
const FIXTURE = `
apiVersion: source.toolkit.fluxcd.io/v1
kind: OCIRepository
metadata:
  name: ${NAME}
  namespace: ${NAMESPACE}
spec:
  suspend: true
  interval: 10m
  url: oci://gsoci.azurecr.io/charts/giantswarm/hello-world
  ref:
    tag: "1.5.0"
---
apiVersion: helm.toolkit.fluxcd.io/v2
kind: HelmRelease
metadata:
  name: ${NAME}
  namespace: ${NAMESPACE}
spec:
  suspend: true
  interval: 10m
  chartRef:
    kind: OCIRepository
    name: ${NAME}
    namespace: ${NAMESPACE}
`;

async function kubectl(args: string[], input?: string) {
  const child = run('kubectl', ['--context', CONTEXT, ...args], {
    encoding: 'utf8',
  });
  if (input !== undefined) {
    child.child.stdin?.end(input);
  }
  return child;
}

async function exists(plural: string, name: string): Promise<boolean> {
  try {
    await kubectl(['-n', NAMESPACE, 'get', plural, name]);
    return true;
  } catch {
    return false;
  }
}

function deploymentPath(namespace: string, name: string) {
  return `/deployments/${lab.installation}/helmrelease/${namespace}/${name}`;
}

test.describe('uninstalling an app deployment', () => {
  test.beforeEach(async () => {
    await kubectl(['apply', '-f', '-'], FIXTURE);
  });

  test.afterEach(async () => {
    // The happy path already deleted these; this is for a test that failed
    // before it got there.
    await kubectl([
      '-n',
      NAMESPACE,
      'delete',
      'helmrelease,ocirepository',
      NAME,
      '--ignore-not-found',
    ]).catch(() => undefined);
  });

  test('removes the release and the chart source it owns', async ({
    admin,
  }) => {
    await admin.goto(deploymentPath(NAMESPACE, NAME));

    const uninstall = admin.getByRole('button', { name: 'Uninstall' });
    await expect(
      uninstall,
      'an unowned deployment offers Uninstall',
    ).toBeVisible({ timeout: 60_000 });

    await uninstall.click();

    const dialog = admin.getByRole('dialog');
    await expect(dialog, 'the confirmation names the app').toContainText(NAME);

    await dialog.getByRole('button', { name: 'Uninstall' }).click();

    await expect(admin, 'the portal returns to the deployments list').toHaveURL(
      /\/deployments\/?(\?|$)/,
      { timeout: 60_000 },
    );

    await expect
      .poll(() => exists('helmrelease', NAME), { timeout: 60_000 })
      .toBe(false);
    await expect
      .poll(() => exists('ocirepository', NAME), { timeout: 60_000 })
      .toBe(false);
  });

  test('withholds Uninstall from a deployment a reconciler owns', async ({
    admin,
  }) => {
    // Rendered by the agent-platform umbrella chart, so Helm re-creates it.
    await admin.goto(deploymentPath(NAMESPACE, 'valkey'));

    await expect(
      admin.getByRole('heading', { name: /valkey/ }).first(),
      'the owned deployment’s page rendered',
    ).toBeVisible({ timeout: 60_000 });

    await expect(
      admin.getByRole('button', { name: 'Uninstall' }),
      'a Helm-owned deployment offers no Uninstall',
    ).toBeHidden();
  });
});
