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

type Scenario = {
  name: string;
  semver?: string;
  semverFilter?: string;
  /** The version Flux resolved the range to, written to the fixture's status */
  revision?: string;
  label: string;
};

/**
 * The release-stage scenarios of the SemVer automatic upgrades guide, plus a
 * filter it does not document, and ranges with an upper bound, each with the
 * label the deployment page shows for its Automatic upgrades.
 */
const SCENARIOS: Scenario[] = [
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
  {
    name: 'auto-upgrades-any',
    label: 'Any, including pre-releases',
  },
  {
    name: 'auto-upgrades-minor-bounded',
    semver: '>=5.12.0 <6.0.0',
    label: 'Minor and patch',
  },
  {
    name: 'auto-upgrades-minor-zero',
    semver: '>=0.2.0 <1.0.0',
    label: 'Minor and patch',
  },
  {
    name: 'auto-upgrades-caret-zero',
    semver: '^0.7.1',
    label: 'Patch',
  },
  // Read from the current version: minor and patch from 1.0.0, patch at 1.4.x
  {
    name: 'auto-upgrades-bounded-current',
    semver: '>=1.0.0 <1.5.0',
    revision: '1.4.2',
    label: 'Patch',
  },
  // Any from 1.0.0-0, minor and patch at 2.x
  {
    name: 'auto-upgrades-bounded-prerelease',
    semver: '>=1.0.0-0 <3.0.0',
    revision: '2.4.1',
    label: 'Minor and patch, including pre-releases',
  },
];

/** A value as a single-quoted YAML scalar. */
function quoted(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * A suspended HelmRelease and OCIRepository per scenario, so the lab's
 * controllers never fetch or install anything: the objects exist for the
 * portal to read. A scenario's revision is written to the OCIRepository's
 * status afterwards, where Flux records the version it resolved.
 */
function fixture({ name, semver = '>=0.0.0-0', semverFilter }: Scenario) {
  const filter = semverFilter
    ? `\n    semverFilter: ${quoted(semverFilter)}`
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
    semver: ${quoted(semver)}${filter}
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

test.describe("a deployment's automatic upgrades", () => {
  test.skip(
    !KUBECONFIG,
    "needs kubectl access to the lab; set AGENTLAB_KUBECONFIG to the lab's state/kubeconfig",
  );

  test.beforeAll(async () => {
    await kubectl(['apply', '-f', '-'], SCENARIOS.map(fixture).join('\n---\n'));
    for (const { name, revision } of SCENARIOS) {
      if (!revision) continue;
      const artifact = {
        revision: `${revision}@sha256:${'0'.repeat(64)}`,
        digest: `sha256:${'0'.repeat(64)}`,
        lastUpdateTime: new Date().toISOString(),
        path: `ocirepository/${NAMESPACE}/${name}.tar.gz`,
        url: `http://source-controller.invalid/${name}.tar.gz`,
      };
      await kubectl([
        '-n',
        NAMESPACE,
        'patch',
        'ocirepository',
        name,
        '--subresource=status',
        '--type=merge',
        '-p',
        JSON.stringify({ status: { artifact } }),
      ]);
    }
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
