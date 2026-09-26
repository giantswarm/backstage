import type { Locator, Page } from '@playwright/test';
import { expect, open, test } from './fixtures';
import { lab } from './lab';

/**
 * Add model backend and Remove backend on the Serving page: model-manager's
 * `add_backend` / `remove_backend` reached through muster as the signed-in
 * person. The lab runs model-manager with no backend of its own, so the
 * lab's Ollama is registered from the portal and removed again, and a KServe
 * that serves nothing yet (the lab has no InferenceService API) gets a card
 * of its own and is removed from it. Serial: both tests write the same
 * model-manager's backend documents.
 */
test.describe.serial('model backends', () => {
  test('Add model backend registers the lab Ollama as a Serving group, Remove backend removes it', async ({
    admin,
  }) => {
    test.setTimeout(180_000);
    await open(admin, '/agent-platform/models/serving');

    const dialog = await openAddDialog(admin);
    await pickKind(admin, dialog, 'Ollama');
    await dialog
      .getByRole('textbox', { name: 'Endpoint', exact: true })
      .fill(lab.ollamaEndpoint);
    await dialog.getByRole('button', { name: 'Review' }).click();
    await expect(
      dialog.getByText('model-backend-ollama.yaml', { exact: true }),
      'the dry run shows the backend document named after its ConfigMap',
    ).toBeVisible({ timeout: 30_000 });

    await dialog.getByRole('button', { name: 'Deploy' }).click();
    await expect(
      dialog.getByText('Registered model-backend-ollama as you'),
      'Deploy registered the backend as the person',
    ).toBeVisible({ timeout: 30_000 });
    await dialog.getByRole('button', { name: 'Close' }).first().click();

    const group = admin.getByRole('heading', { level: 3, name: /^Ollama/ });
    await expect(
      group,
      'the registered Ollama appears as a Serving group without a chart change',
    ).toBeVisible({ timeout: 60_000 });
    await expect(admin.getByText('Registered from the portal')).toBeVisible();
    await expect(
      admin.getByRole('grid').getByRole('row').nth(1),
      "the group lists the host's models",
    ).toBeVisible({ timeout: 60_000 });

    await removeBackend(admin, 'Ollama', 'ollama');
    await expect(group, 'the group is gone').toBeHidden({ timeout: 60_000 });
    await expect(admin.getByText('Registered from the portal')).toBeHidden();
  });

  test('a registered backend without models gets a card of its own and is removed from it', async ({
    admin,
  }) => {
    test.setTimeout(180_000);
    await open(admin, '/agent-platform/models/serving');

    const dialog = await openAddDialog(admin);
    await pickKind(admin, dialog, 'KServe');
    await dialog
      .getByRole('textbox', { name: 'Serving namespace' })
      .fill('model-serving');
    await dialog.getByRole('button', { name: 'Review' }).click();
    await expect(
      dialog.getByText('model-backend-kserve.yaml', { exact: true }),
    ).toBeVisible({ timeout: 30_000 });
    await dialog.getByRole('button', { name: 'Deploy' }).click();
    await expect(
      dialog.getByText('Registered model-backend-kserve as you'),
    ).toBeVisible({ timeout: 30_000 });
    await dialog.getByRole('button', { name: 'Close' }).first().click();

    const card = admin.getByTestId(
      `served-models-group-${lab.installation}/kserve`,
    );
    await expect(
      card,
      'a backend that serves nothing yet gets a card of its own',
    ).toBeVisible({ timeout: 60_000 });
    await expect(card.getByText('Registered from the portal')).toBeVisible();

    await removeBackend(card, 'KServe', 'kserve', admin);
    await expect(card, 'the card is gone').toBeHidden({ timeout: 60_000 });
  });
});

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
