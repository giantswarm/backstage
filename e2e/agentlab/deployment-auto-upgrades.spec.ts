import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { expect, test } from './fixtures';
import { lab } from './lab';

const run = promisify(execFile);

/**
 * The lab's admin kubeconfig, its `state/kubeconfig`: the portal has no flow
 * that writes an OCIRepository's `semverFilter`, so the fixtures are applied
 * with `kubectl`.
 */
const KUBECONFIG = process.env.AGENTLAB_KUBECONFIG;
const NAMESPACE = 'agent-platform';

/**
 * The release-stage scenarios of the SemVer automatic upgrades guide, plus a
 * filter it does not document, each with the label the deployment page shows
 * for its Automatic upgrades.
 */
const SCENARIOS = [
  {
    name: 'auto-upgrades-dev',
    semverFilter: '^.*-r[0-9a-f]{8}t[0-9]{14}h[0-9a-f]{7}$',
    label: 'Dev builds only',
  },
  {
    name: 'auto-upgrades-rc',
    semverFilter: '.*-rc\\..*',
    label: 'Release candidates only',
  },
  {
    name: 'auto-upgrades-rc-or-stable',
    semverFilter: '^[0-9]+\\.[0-9]+\\.[0-9]+(-rc\\.[0-9]+)?$',
    label: 'Release candidates or stable',
  },
  {
    name: 'auto-upgrades-custom',
    semverFilter: '^1\\.2\\.4-rc\\..*',
    label: 'Tags matching ^1\\.2\\.4-rc\\..*',
  },
  { name: 'auto-upgrades-any', semverFilter: undefined, label: 'Any' },
];

/**
 * A suspended HelmRelease and OCIRepository per scenario, so the lab's
 * controllers never fetch or install anything: the objects exist for the
 * portal to read.
 */
function fixture(name: string, semverFilter?: string) {
  const filter = semverFilter
    ? `\n    semverFilter: '${semverFilter.replace(/'/g, "''")}'`
    : '';
  return `
apiVersion: source.toolkit.fluxcd.io/v1
kind: OCIRepository
metadata:
  name: ${name}
  namespace: ${NAMESPACE}
spec:
  suspend: true
  interval: 10m
  url: oci://gsoci.azurecr.io/charts/giantswarm/hello-world
  ref:
    semver: '>=0.0.0-0'${filter}
---
apiVersion: helm.toolkit.fluxcd.io/v2
kind: HelmRelease
metadata:
  name: ${name}
  namespace: ${NAMESPACE}
spec:
  suspend: true
  interval: 10m
  chartRef:
    kind: OCIRepository
    name: ${name}
    namespace: ${NAMESPACE}
`;
}

async function kubectl(args: string[], input?: string) {
  const child = run('kubectl', ['--kubeconfig', KUBECONFIG!, ...args], {
    encoding: 'utf8',
  });
  if (input !== undefined) {
    child.child.stdin?.end(input);
  }
  return child;
}

test.describe("a deployment's automatic upgrades with a semver filter", () => {
  test.skip(
    !KUBECONFIG,
    "needs kubectl access to the lab; set AGENTLAB_KUBECONFIG to the lab's state/kubeconfig",
  );

  test.beforeAll(async () => {
    await kubectl(
      ['apply', '-f', '-'],
      SCENARIOS.map(s => fixture(s.name, s.semverFilter)).join('\n---\n'),
    );
  });

  test.afterAll(async () => {
    await kubectl([
      '-n',
      NAMESPACE,
      'delete',
      'helmrelease,ocirepository',
      ...SCENARIOS.map(s => s.name),
      '--ignore-not-found',
    ]).catch(() => undefined);
  });

  for (const { name, label } of SCENARIOS) {
    test(`${name} shows "${label}"`, async ({ admin }) => {
      await admin.goto(
        `/deployments/${lab.installation}/helmrelease/${NAMESPACE}/${name}`,
      );

      const field = admin.getByRole('heading', {
        name: 'Auto-upgrade',
        exact: true,
      });
      await expect(field, 'the About card names the auto-upgrade').toBeVisible({
        timeout: 60_000,
      });
      await expect(field.locator('xpath=following-sibling::*[1]')).toHaveText(
        label,
        { timeout: 30_000 },
      );
    });
  }
});
