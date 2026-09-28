import type { Locator, Page } from '@playwright/test';
import { expect, open, test } from './fixtures';

/**
 * The Serve dialog's Node field against the lab's KServe backend
 * (`platform.serving`: the CPU preset `qwen2-5-0-5b-cpu`), as the admin:
 *
 * - "Any node that fits" is preselected, and the verdict then names the
 *   nodes the model may land on — never one node the request does not pin;
 * - each node is offered with its free budget; choosing one turns the
 *   verdict into "will be placed on <node>", and Serve sends it as `node`
 *   (the LLMInferenceService carries the hostname pin — checked with kubectl
 *   outside this spec).
 *
 * Stops the lab preset first when it serves; leaves it served. Skipped
 * without the serving slice.
 */

const PRESET = 'qwen2-5-0-5b-cpu';
const PRESET_LABEL = /Qwen2\.5 0\.5B Instruct \(CPU\)/;
const TARGET = /· KServe$/;
const shots = process.env.AGENTLAB_E2E_SCREENSHOTS;

async function snapshot(page: Page, name: string, of?: Locator) {
  if (!shots) {
    return;
  }
  if (of) {
    await of.scrollIntoViewIfNeeded();
    await of.screenshot({ path: `${shots}/${name}.png` });
  } else {
    await page.screenshot({ path: `${shots}/${name}.png` });
  }
}

function presetRow(page: Page) {
  return page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: /^KServe/ }) })
    .getByRole('row')
    .filter({ hasText: PRESET });
}

async function openServeDialog(page: Page) {
  await page.getByRole('button', { name: 'Serve model' }).click();
  const dialog = page.getByRole('dialog', { name: 'Serve model' });
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole('button', { name: /Installation and backend/ })
    .click();
  const offered =
    (await page.getByRole('option', { name: TARGET }).count()) > 0;
  if (!offered) {
    await page.keyboard.press('Escape');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
  }
  test.skip(!offered, 'the lab has no KServe backend (platform.serving)');
  await page.getByRole('option', { name: TARGET }).click();
  return dialog;
}

test.describe.serial('Serve on a chosen node', () => {
  test.setTimeout(10 * 60_000);

  test.beforeEach(async ({ admin }) => {
    await open(admin, '/agent-platform/models/serving');
    await expect(admin.getByRole('article').first()).toBeVisible();
  });

  test('the Node field offers any node and each node; the pick is the verdict and the pin', async ({
    admin,
  }) => {
    // A served preset cannot be served again: stop it first.
    const row = presetRow(admin);
    if ((await row.count()) > 0) {
      await row.getByRole('button', { name: `Actions for ${PRESET}` }).click();
      await admin.getByRole('menuitem', { name: /^Stop serving/ }).click();
      await admin
        .getByRole('dialog', { name: `Stop serving "${PRESET}"?` })
        .getByRole('button', { name: 'Stop serving' })
        .click();
      await expect(row).toHaveCount(0, { timeout: 60_000 });
    }

    const dialog = await openServeDialog(admin);
    await dialog.getByRole('button', { name: /Preset/ }).click();
    await admin.getByRole('option', { name: PRESET_LABEL }).click();

    const verdict = dialog.getByTestId('serve-fit-verdict');
    await expect(verdict, 'unpinned: the nodes it may land on').toContainText(
      /Fits on \S+/,
      { timeout: 60_000 },
    );
    await expect(verdict).not.toContainText('will be placed');

    const nodeField = dialog.getByRole('button', { name: /Node/ });
    await expect(nodeField).toContainText('Any node that fits');
    await nodeField.click();
    const nodeOption = admin
      .getByRole('option')
      .filter({ hasText: /free of/ })
      .first();
    await expect(nodeOption).toBeVisible();
    await snapshot(admin, 'serve-node-options', admin.getByRole('listbox'));
    // The option reads the node's name, its budget on the line below.
    const node = (await nodeOption.innerText()).split('\n')[0].trim();
    await nodeOption.click();

    await expect(verdict).toContainText(`Fits — will be placed on ${node}`, {
      timeout: 60_000,
    });
    await snapshot(admin, 'serve-node-chosen', dialog);

    const serve = dialog.getByRole('button', { name: 'Serve', exact: true });
    await expect(serve).toBeEnabled();
    await serve.click();
    await expect(dialog).toBeHidden({ timeout: 60_000 });
    await expect(
      admin.getByText(new RegExp(`^Serving ".+" on ${node} · `)),
      'the toast names the chosen node',
    ).toBeVisible();

    await expect(presetRow(admin)).toContainText('Ready', {
      timeout: 8 * 60_000,
    });
    await expect(presetRow(admin)).toContainText(node);
    await snapshot(admin, 'serve-node-row', presetRow(admin));
  });
});
