import type { Page } from '@playwright/test';
import {
  expect,
  fillAgentDetails,
  open,
  openWizardMoreOptions,
  test,
} from './fixtures';
import { KUBECONFIG, kubectl, NEEDS_KUBECONFIG } from './kubectl';
import { lab, type LabUser } from './lab';

// An installation offers codex with a Harness of its own beside the platform
// one. The portal has no flow for a Harness, so the fixture is applied with
// `kubectl`, the way the kagent chart renders one from the installation's
// values. It is never run: the wizard only lists it.

const NAME = 'e2e-codex';

/** Where the wizard's preselected model lives, and so its Harnesses. */
async function modelNamespace(): Promise<string> {
  const { stdout } = await kubectl([
    'get',
    'modelconfigs.api.kagent.dev',
    '--all-namespaces',
    '--field-selector',
    'metadata.name=default-model-config',
    '-o',
    'jsonpath={.items[0].metadata.namespace}',
  ]);
  return stdout.trim();
}

function fixture(namespace: string) {
  return `
apiVersion: api.kagent.dev/v1alpha3
kind: Harness
metadata:
  name: ${NAME}
  namespace: ${namespace}
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
  name: ${NAME}-modelconfig-reader
rules:
  - apiGroups: [api.kagent.dev]
    resources: [modelconfigs]
    verbs: [get, list, watch]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: ${NAME}-modelconfig-reader
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: ${NAME}-modelconfig-reader
subjects:
  - apiGroup: rbac.authorization.k8s.io
    kind: Group
    name: oidc:developers
`;

async function openRuntimes(page: Page, user: LabUser = lab.users.admin) {
  await open(page, '/agent-platform/agents/new', user);
  await fillAgentDetails(page, {
    name: 'Codex card check',
    description: 'Never created: the spec only reads the runtime cards.',
    instructions: 'None.',
  });
  await openWizardMoreOptions(page);
}

function codexCard(page: Page) {
  return page.getByRole('radio', { name: `Codex, Harness ${NAME}` });
}

test.describe('the Codex card in the wizard', () => {
  test.skip(!KUBECONFIG, NEEDS_KUBECONFIG);

  let namespace = '';

  test.beforeAll(async () => {
    namespace = await modelNamespace();
  });

  test.afterAll(async () => {
    if (namespace) {
      await kubectl([
        '-n',
        namespace,
        'delete',
        'harnesses.api.kagent.dev',
        NAME,
        '--ignore-not-found',
      ]).catch(() => undefined);
    }
    await kubectl(
      ['delete', '--ignore-not-found', '-f', '-'],
      MODEL_READER,
    ).catch(() => undefined);
  });

  test('appears where the namespace offers a codex Harness and nowhere else', async ({
    admin,
  }) => {
    test.setTimeout(4 * 60_000);
    await openRuntimes(admin);
    await expect(admin.getByText('Platform default')).toBeVisible({
      timeout: 30_000,
    });
    await expect(codexCard(admin), 'no codex Harness, no card').toHaveCount(0);

    await kubectl(['apply', '-f', '-'], fixture(namespace));
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
      namespace,
      'delete',
      'harnesses.api.kagent.dev',
      NAME,
    ]);
    await openRuntimes(admin);
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
    await kubectl(
      ['apply', '-f', '-'],
      `${fixture(namespace)}---${MODEL_READER}`,
    );
    const dev = await signInAs(lab.users.dev);
    await openRuntimes(dev, lab.users.dev);

    await expect(dev.getByText('Could not read the runtimes')).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      dev.getByText(/so the agent runs on the platform Harness\.$/),
    ).toBeVisible();
    await expect(dev.getByRole('radio', { name: /Harness / })).toHaveCount(0);
  });
});
