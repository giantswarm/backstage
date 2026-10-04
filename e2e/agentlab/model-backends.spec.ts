import type { Locator, Page } from '@playwright/test';
import { expect, open, test } from './fixtures';
import { lab } from './lab';

/**
 * Add model backend and Remove backend on the Serving page: model-manager's
 * `add_backend` / `remove_backend` reached through muster as the signed-in
 * person. A default lab's model-manager serves the host's Ollama and Lemonade
 * and the lab's KServe as backends of its own, so the dialog offers only the
 * kind left — LM Studio — which the suite registers at an endpoint nothing
 * serves, finds on a card of its own and removes again. Serial: both tests
 * read the same model-manager's backend documents.
 */
test.describe.serial('model backends', () => {
  test('Add model backend offers no kind the installation already serves', async ({
    admin,
  }) => {
    await open(admin, '/agent-platform/models/serving');
    await expect(
      admin.getByRole('heading', { level: 3, name: /^Ollama/ }),
      "the lab's own Ollama is a Serving group",
    ).toBeVisible({ timeout: 60_000 });

    const dialog = await openAddDialog(admin);
    await dialog.getByRole('button', { name: /Kind$/ }).click();
    const kinds = admin.getByRole('listbox', { name: 'Kind' });
    await expect(
      kinds.getByRole('option', { name: 'LM Studio' }),
    ).toBeVisible();
    await expect(
      kinds.getByRole('option', { name: 'Ollama', exact: true }),
      'one backend per kind: the served Ollama is not offered again',
    ).toBeHidden();
  });

  test('a registered backend without models gets a card of its own and is removed from it', async ({
    admin,
  }) => {
    test.setTimeout(180_000);
    await open(admin, '/agent-platform/models/serving');

    const dialog = await openAddDialog(admin);
    await pickKind(admin, dialog, 'LM Studio');
    await dialog
      .getByRole('textbox', { name: 'Endpoint', exact: true })
      .fill(UNSERVED_ENDPOINT);
    await dialog.getByRole('button', { name: 'Review' }).click();
    await expect(
      dialog.getByText('model-backend-lmstudio.yaml', { exact: true }),
      'the dry run shows the backend document named after its ConfigMap',
    ).toBeVisible({ timeout: 30_000 });
    await dialog.getByRole('button', { name: 'Deploy' }).click();
    await expect(
      dialog.getByText('Registered model-backend-lmstudio as you'),
      'Deploy registered the backend as the person',
    ).toBeVisible({ timeout: 30_000 });
    await dialog.getByRole('button', { name: 'Close' }).first().click();

    const card = admin.getByTestId(
      `served-models-group-${lab.installation}/lmstudio`,
    );
    await expect(
      card,
      'a backend that serves nothing yet gets a card of its own',
    ).toBeVisible({ timeout: 60_000 });
    await expect(card.getByText('Registered from the portal')).toBeVisible();

    await removeBackend(card, 'LM Studio', 'lmstudio', admin);
    await expect(card, 'the card is gone').toBeHidden({ timeout: 60_000 });
  });
});

/**
 * An LM Studio endpoint nothing listens on — the discard port of the host
 * that serves the lab's Ollama — so the backend registers and lists no models.
 */
const UNSERVED_ENDPOINT = `http://${new URL(lab.ollamaEndpoint).hostname}:9`;

async function openAddDialog(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Add model backend' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Add model backend' });
  await expect(dialog).toBeVisible();
  return dialog;
}

/** The Kind select is a react-aria listbox: open it, pick the option. */
async function pickKind(page: Page, dialog: Locator, label: string) {
  await dialog.getByRole('button', { name: /Kind$/ }).click();
  await page.getByRole('option', { name: label, exact: true }).click();
}

/**
 * Remove backend from a group header (or a Backends-without-models row):
 * the dry run lists the ConfigMap, the person types the kind, confirms, and
 * closes the dialog once model-manager reports the removal.
 */
async function removeBackend(
  scope: Locator | Page,
  label: string,
  kind: string,
  page: Page = scope as Page,
) {
  await scope.getByRole('button', { name: 'Remove backend' }).click();
  const dialog = page.getByRole('dialog', {
    name: new RegExp(`^Remove ${label} backend from `),
  });
  await expect(
    dialog.getByText(new RegExp(`^ConfigMap \\S+/model-backend-${kind}$`)),
    'the remove dry run names the ConfigMap',
  ).toBeVisible({ timeout: 30_000 });
  await dialog
    .getByRole('textbox', { name: `Type ${kind} to confirm` })
    .fill(kind);
  await dialog.getByRole('button', { name: 'Remove backend' }).click();
  await expect(
    dialog.getByText(`Removed the ${label} backend as you`),
  ).toBeVisible({
    timeout: 30_000,
  });
  await dialog.getByRole('button', { name: 'Close' }).first().click();
}
