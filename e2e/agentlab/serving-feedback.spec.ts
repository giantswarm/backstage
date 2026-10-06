import type { Locator, Page } from '@playwright/test';
import { expect, open, test } from './fixtures';

/**
 * The Serve dialog and the Serving list against the lab's KServe backend
 * (`platform.serving`: the CPU preset `qwen2-5-0-5b-cpu`), as the admin:
 *
 * - a preset that serves already is offered as "Serving on <node>" and
 *   cannot be chosen, and model-manager is never asked to serve it again;
 * - Stop serving takes the row off the list without a reload;
 * - Serve ends in a toast naming the node, and the row reads Starting (never
 *   a red Not ready) until the model answers.
 *
 * Serves the lab preset first when it does not serve yet (a fresh lab, or an
 * earlier spec stopped it); leaves it served. Skipped without the serving
 * slice.
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

function kserveCard(page: Page) {
  // Headed `KServe · vLLM <version>` once a model answers, `KServe` before.
  return page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: /^KServe/ }) });
}

function presetRow(page: Page) {
  return kserveCard(page).getByRole('row').filter({ hasText: PRESET });
}

async function openServeDialog(page: Page) {
  await page.getByRole('button', { name: 'Serve model' }).click();
  const dialog = page.getByRole('dialog', { name: 'Serve model' });
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole('button', { name: /Installation and backend/ })
    .click();
  await page.getByRole('option', { name: TARGET }).click();
  return dialog;
}

/** Picks the lab preset in the Serve dialog and serves it; resolves once the dialog closed. */
async function servePreset(page: Page) {
  const dialog = await openServeDialog(page);
  await dialog.getByRole('button', { name: /Preset/ }).click();
  await page.getByRole('option', { name: PRESET_LABEL }).click();
  const serve = dialog.getByRole('button', { name: 'Serve', exact: true });
  await expect(serve, 'enabled once the fit verdict is in').toBeEnabled({
    timeout: 60_000,
  });
  await serve.click();
  await expect(dialog).toBeHidden({ timeout: 60_000 });
}

test.describe.serial('Serve feedback on KServe', () => {
  test.setTimeout(10 * 60_000);

  // The KServe card goes with its last model, so without one the backend's
  // presence is read off the Serve dialog's targets.
  test.beforeEach(async ({ admin }) => {
    await open(admin, '/agent-platform/models/serving');
    await expect(admin.getByRole('article').first()).toBeVisible();
    await admin
      .getByRole('heading', { name: /^KServe/ })
      .first()
      .waitFor({ timeout: 30_000 })
      .catch(() => undefined);
    if ((await kserveCard(admin).count()) > 0) {
      return;
    }
    await admin.getByRole('button', { name: 'Serve model' }).click();
    const dialog = admin.getByRole('dialog', { name: 'Serve model' });
    await dialog
      .getByRole('button', { name: /Installation and backend/ })
      .click();
    const offered =
      (await admin.getByRole('option', { name: TARGET }).count()) > 0;
    await admin.keyboard.press('Escape');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    test.skip(!offered, 'the lab has no KServe backend (platform.serving)');
  });

  test('a served preset reads "Serving on <node>" and cannot be served again', async ({
    admin,
  }) => {
    const row = presetRow(admin);
    await row
      .first()
      .waitFor({ timeout: 30_000 })
      .catch(() => undefined);
    if ((await row.count()) === 0) {
      await servePreset(admin);
    }
    await expect(row).toContainText('Ready', { timeout: 8 * 60_000 });
    const dialog = await openServeDialog(admin);
    await dialog.getByRole('button', { name: /Preset/ }).click();
    const option = admin.getByRole('option', { name: PRESET_LABEL });
    await expect(option).toContainText(/Serving on \S+/);
    await expect(option).toHaveAttribute('aria-disabled', 'true');
    await snapshot(admin, 'serve-dialog-served-preset', option);
    await admin.keyboard.press('Escape');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
  });

  test('Stop serving takes the row off the list without a reload', async ({
    admin,
  }) => {
    const row = presetRow(admin);
    await expect(row).toBeVisible({ timeout: 60_000 });
    await row.getByRole('button', { name: `Actions for ${PRESET}` }).click();
    await admin.getByRole('menuitem', { name: /^Stop serving/ }).click();
    const confirm = admin.getByRole('dialog', {
      name: `Stop serving "${PRESET}"?`,
    });
    await confirm.getByRole('button', { name: 'Stop serving' }).click();
    await expect(admin.getByText(`Stopped serving "${PRESET}"`)).toBeVisible();
    // One active poll (10 s) after the object is gone, no reload.
    await expect(row).toHaveCount(0, { timeout: 60_000 });
    await snapshot(admin, 'serving-list-after-stop');
  });

  test('Serve toasts the node, and the row reads Starting until Ready, never red', async ({
    admin,
  }) => {
    await servePreset(admin);
    await expect(
      admin.getByText(/^Serving ".+" on .+ · \S+ — loading$/),
      'the toast names the node',
    ).toBeVisible();
    await snapshot(admin, 'serve-toast');

    const row = presetRow(admin);
    await expect(row).toBeVisible({ timeout: 60_000 });
    const seen = new Set<string>();
    await expect
      .poll(
        async () => {
          const text = await row.innerText();
          const state =
            ['Ready', 'Starting', 'Pending', 'Not ready'].find(s =>
              text.includes(s),
            ) ?? 'other';
          seen.add(state);
          if (state === 'Starting') {
            await snapshot(admin, 'serving-row-starting', row);
          }
          return state;
        },
        { timeout: 8 * 60_000, intervals: [2_000] },
      )
      .toBe('Ready');
    expect([...seen], 'a normal start never reads Not ready').not.toContain(
      'Not ready',
    );
    expect([...seen]).toContain('Starting');
    await snapshot(admin, 'serving-row-ready', row);
  });
});
