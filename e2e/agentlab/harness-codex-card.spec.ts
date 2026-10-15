import type { Page } from '@playwright/test';
import {
  expect,
  fillAgentDetails,
  open,
  openWizardMoreOptions,
  test,
} from './fixtures';
import { KUBECONFIG, kubectl, NEEDS_KUBECONFIG } from './kubectl';

// An installation offers codex with a Harness of its own beside the platform
// one. The portal has no flow for a Harness, so the fixture is applied with
// `kubectl`, the way the kagent chart renders one from the installation's
// values. It is never run: the wizard only lists it.

const NAME = 'e2e-codex';

/** Where the wizard's preselected model lives, and so its Harnesses. */
async function modelNamespace(): Promise<string> {
  const { stdout } = await kubectl([
    'get',
    'modelconfigs.kagent.dev',
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
  workload:
    image: gsoci.azurecr.io/giantswarm/kagent/codex-harness:e2e
`;
}

async function openRuntimes(page: Page) {
  await open(page, '/agent-platform/agents/new');
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
        'harnesses.kagent.dev',
        NAME,
        '--ignore-not-found',
      ]).catch(() => undefined);
    }
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

    await kubectl(['-n', namespace, 'delete', 'harnesses.kagent.dev', NAME]);
    await openRuntimes(admin);
    await expect(
      codexCard(admin),
      'the card leaves with its Harness',
    ).toHaveCount(0);
  });
});
