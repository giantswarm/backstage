import type { Page } from '@playwright/test';
import {
  expect,
  fillAgentDetails,
  open,
  openWizardMoreOptions,
  test,
} from './fixtures';
import { KUBECONFIG, kubectl, NEEDS_KUBECONFIG } from './kubectl';
import { LEFTOVER_AGE, RUN, lab, type LabUser } from './lab';

// An installation offers codex with a Harness of its own beside the platform
// one. The portal has no flow for a Harness, so the fixture is applied with
// `kubectl`, the way the kagent chart renders one from the installation's
// values. The kagent controller only resolves a Harness's WorkerPool until an
// Agent boots on it ("no Agent has booted on the Harness yet"), so the
// fixture, which no Agent names, pulls no image and starts no pod.

/** What every fixture of this spec carries, its run in a label of its own. */
const FIXTURE_LABEL = 'e2e.giantswarm.io/fixture=harness-codex-card';
const RUN_LABEL = 'e2e.giantswarm.io/run';

/** Scoped to the run, so two runs against one lab never touch each other's. */
const NAME = `e2e-codex-${RUN}`;
const READER = `${NAME}-modelconfig-reader`;

const metadataLabels = `
  labels:
    ${FIXTURE_LABEL.replace('=', ': ')}
    ${RUN_LABEL}: ${RUN}`;

/**
 * Where the wizard looks for Harnesses: the namespace of the model it
 * preselects, `default-model-config` in `kagent` first, as
 * `preselectedModelConfig` picks it. Undefined on a lab without one.
 */
async function modelNamespace(): Promise<string | undefined> {
  const { stdout } = await kubectl([
    'get',
    'modelconfigs.api.kagent.dev',
    '--all-namespaces',
    '--field-selector',
    'metadata.name=default-model-config',
    '-o',
    'jsonpath={.items[*].metadata.namespace}',
  ]);
  const namespaces = stdout.split(/\s+/).filter(Boolean);
  return namespaces.includes('kagent') ? 'kagent' : namespaces[0];
}

function harnessFixture(namespace: string) {
  return `
apiVersion: api.kagent.dev/v1alpha3
kind: Harness
metadata:
  name: ${NAME}
  namespace: ${namespace}${metadataLabels}
spec:
  codex: {}
  substrate:
    snapshotPolicy:
      location: s3://ate-snapshots/${NAME}
    workerPoolRef:
      name: kagent-default
  workload:
    image: gsoci.azurecr.io/giantswarm/kagent/codex-harness@sha256:${'0'.repeat(64)}
`;
}

/**
 * The wizard lists the fleet's ModelConfigs across namespaces; the lab's
 * developers read them only in their own. This grants them that read and
 * nothing on Harnesses: a person who may pick a model but not list runtimes.
 */
const MODEL_READER = `
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: ${READER}${metadataLabels}
rules:
  - apiGroups: [api.kagent.dev]
    resources: [modelconfigs]
    verbs: [get, list, watch]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: ${READER}${metadataLabels}
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: ${READER}
subjects:
  - apiGroup: rbac.authorization.k8s.io
    kind: Group
    name: oidc:developers
`;

const KINDS = 'harnesses.api.kagent.dev,clusterrolebindings,clusterroles';

/**
 * Removes this run's fixtures and what an aborted run left: one whose run id
 * (its start, `Date.now()` in base 36) is older than {@link LEFTOVER_AGE}, or
 * not a start at all. A run going on at the same time keeps its own.
 */
async function removeFixtures() {
  const { stdout } = await kubectl([
    'get',
    KINDS,
    '--all-namespaces',
    '-l',
    FIXTURE_LABEL,
    '-o',
    `jsonpath={range .items[*]}{.kind}/{.metadata.name} {.metadata.namespace} {.metadata.labels.e2e\\.giantswarm\\.io/run}{"\\n"}{end}`,
  ]);
  for (const line of stdout.split('\n').filter(Boolean)) {
    const [object, namespace, run] = line.split(' ');
    const started = parseInt(run, 36);
    const leftover =
      !Number.isFinite(started) || Date.now() - started > LEFTOVER_AGE;
    if (run === RUN || leftover) {
      await kubectl([
        'delete',
        object,
        '--ignore-not-found',
        ...(namespace ? ['-n', namespace] : []),
      ]);
    }
  }
}

async function openRuntimes(page: Page, user: LabUser = lab.users.admin) {
  await open(page, '/customize/agents/new', user);
  await fillAgentDetails(page, {
    name: 'Codex card check',
    description: 'Never created: the spec only reads the runtime cards.',
    instructions: 'None.',
  });
  await openWizardMoreOptions(page);
}

/** The runtime cards are read, not loading: the platform one is listed. */
async function expectRuntimesListed(page: Page) {
  await expect(page.getByText('Platform default')).toBeVisible({
    timeout: 30_000,
  });
}

function codexCard(page: Page) {
  return page.getByRole('radio', { name: `Codex, Harness ${NAME}` });
}

test.describe('the Codex card in the wizard', () => {
  test.skip(!KUBECONFIG, NEEDS_KUBECONFIG);

  let namespace: string | undefined;

  test.beforeAll(async () => {
    namespace = await modelNamespace();
    await removeFixtures();
  });

  test.afterAll(async () => {
    // Not swallowed: a fixture left behind widens the shared lab's RBAC.
    await removeFixtures();
  });

  test('appears where the namespace offers a codex Harness and nowhere else', async ({
    admin,
  }) => {
    test.skip(!namespace, 'the lab has no default-model-config');
    test.setTimeout(4 * 60_000);
    await openRuntimes(admin);
    await expectRuntimesListed(admin);
    await expect(codexCard(admin), 'no codex Harness, no card').toHaveCount(0);

    await kubectl(['apply', '-f', '-'], harnessFixture(namespace!));
    await openRuntimes(admin);
    const card = codexCard(admin);
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(card).toHaveText(/Codex/);
    await expect(card).toHaveText(/codex-harness/);
    await expect(card).toHaveAttribute('aria-checked', 'false');
    await expect(
      admin.getByRole('radio', { name: /platform default$/ }),
      'the platform Harness stays the preselected one',
    ).toHaveAttribute('aria-checked', 'true');
    await card.click();
    await expect(card).toHaveAttribute('aria-checked', 'true');

    await kubectl([
      '-n',
      namespace!,
      'delete',
      'harnesses.api.kagent.dev',
      NAME,
    ]);
    await openRuntimes(admin);
    await expectRuntimesListed(admin);
    await expect(
      codexCard(admin),
      'the card leaves with its Harness',
    ).toHaveCount(0);
  });

  // The lab's developer, granted the models' read but not the Harnesses':
  // the wizard keeps the platform Harness and says why.
  test('keeps the platform Harness for a person who may not list Harnesses', async ({
    signInAs,
  }) => {
    test.setTimeout(4 * 60_000);
    await kubectl(['apply', '-f', '-'], MODEL_READER);
    try {
      const dev = await signInAs(lab.users.dev);
      await openRuntimes(dev, lab.users.dev);

      await expect(dev.getByText('Could not read the runtimes')).toBeVisible({
        timeout: 30_000,
      });
      await expect(
        dev.getByText(/so the agent runs on the platform Harness\.$/),
      ).toBeVisible();
      await expect(dev.getByRole('radio', { name: /Harness / })).toHaveCount(0);
    } finally {
      await kubectl(['delete', '--ignore-not-found', '-f', '-'], MODEL_READER);
    }
  });
});
