import type { Locator, Page } from '@playwright/test';
import { expect, open, test } from './fixtures';

/**
 * Serve model (a page of its own, `/agent-platform/models/serving/serve`)
 * and the Serving list against the lab's KServe backend
 * (`platform.serving`: the CPU preset `qwen2-5-0-5b-cpu`), as the admin:
 *
 * - a preset that serves already is offered as "Serving on <node>" and
 *   cannot be chosen, and model-manager is never asked to serve it again;
 * - Stop serving takes the row off the list without a reload;
 * - Serve ends in a toast naming the node, and the row reads Starting (never
 *   a red Not ready) until the model answers.
 *
 * Serves the lab preset first when it does not serve yet (a fresh lab, an
 * earlier spec stopped it, or a failed load it stops first); leaves it served. Skipped without the serving
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

/** Running models: where Serve model returns after a Serve or a Cancel. */
const SERVING_VIEW = /\/agent-platform\/models\/serving\/?$/;

/** Serve model's page, opened from the view's header button. */
async function openServePage(page: Page) {
  await page.getByRole('button', { name: 'Serve model' }).click();
  await expect(page).toHaveURL(/\/agent-platform\/models\/serving\/serve/);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Serve model' }),
  ).toBeVisible();
}

/** Picks the KServe target where the page offers a choice of backend. */
async function openServeOnKServe(page: Page) {
  await openServePage(page);
  // One serving backend on the installation is no choice: the page offers
  // no picker and serves there (the KServe card, `beforeEach`).
  const picker = page.getByRole('button', {
    name: /Environment and backend/,
  });
  if ((await picker.count()) > 0) {
    await picker.click();
    await page.getByRole('option', { name: TARGET }).click();
  }
}

/** Cancel is a link in the page's footer, back to Running models. */
async function cancelServe(page: Page) {
  await page.getByRole('link', { name: 'Cancel' }).click();
  await expect(page).toHaveURL(SERVING_VIEW);
}

/** Picks the lab preset on Serve model and serves it; resolves once back on Running models. */
async function servePreset(page: Page) {
  await openServeOnKServe(page);
  await page.getByRole('button', { name: /Preset/ }).click();
  await page.getByRole('option', { name: PRESET_LABEL }).click();
  const serve = page.getByRole('button', { name: 'Serve', exact: true });
  await expect(serve, 'enabled once the fit verdict is in').toBeEnabled({
    timeout: 60_000,
  });
  await serve.click();
  await expect(page).toHaveURL(SERVING_VIEW, { timeout: 60_000 });
}

/** The preset's row once it stops changing: Ready, Not ready, or no row. */
async function settledPresetState(
  page: Page,
): Promise<'Ready' | 'Not ready' | 'gone'> {
  const row = presetRow(page);
  let state: 'Ready' | 'Not ready' | 'gone' | 'changing' = 'changing';
  await expect
    .poll(
      async () => {
        if ((await row.count()) === 0) {
          state = 'gone';
        } else {
          const text = await row.innerText();
          state = text.includes('Not ready')
            ? 'Not ready'
            : text.includes('Ready')
              ? 'Ready'
              : 'changing';
        }
        return state;
      },
      {
        message: 'the preset row settles: Ready, Not ready or gone',
        timeout: 8 * 60_000,
        intervals: [5_000],
      },
    )
    .not.toBe('changing');
  return state as 'Ready' | 'Not ready' | 'gone';
}

/** Stops serving the preset through its row's actions and waits for the row to go. */
async function stopPreset(page: Page) {
  const row = presetRow(page);
  await row.getByRole('button', { name: `Actions for ${PRESET}` }).click();
  await page.getByRole('menuitem', { name: /^Stop serving/ }).click();
  await page
    .getByRole('dialog', { name: `Stop serving "${PRESET}"?` })
    .getByRole('button', { name: 'Stop serving' })
    .click();
  await expect(row).toHaveCount(0, { timeout: 60_000 });
}

test.describe.serial('Serve feedback on KServe', () => {
  test.setTimeout(10 * 60_000);

  // The KServe card goes with its last model, so without one the backend's
  // presence is read off Serve model's targets.
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
    await openServePage(admin);
    await admin
      .getByRole('button', { name: /Environment and backend/ })
      .click();
    const offered =
      (await admin.getByRole('option', { name: TARGET }).count()) > 0;
    await admin.keyboard.press('Escape');
    await cancelServe(admin);
    test.skip(!offered, 'the lab has no KServe backend (platform.serving)');
  });

  test('a served preset reads "Serving on <node>" and cannot be served again', async ({
    admin,
  }) => {
    const row = presetRow(admin);
    // What an earlier spec left: a Stop still in flight ends without the row,
    // a load still starting ends Ready; a failed load stays Not ready and is
    // stopped first. Then the preset is served unless it serves already.
    let settled = await settledPresetState(admin);
    if (settled === 'Not ready') {
      await stopPreset(admin);
      settled = 'gone';
    }
    if (settled === 'gone') {
      await servePreset(admin);
    }
    await expect(row).toContainText('Ready', { timeout: 8 * 60_000 });
    await openServeOnKServe(admin);
    await admin.getByRole('button', { name: /Preset/ }).click();
    const option = admin.getByRole('option', { name: PRESET_LABEL });
    await expect(option).toContainText(/Serving on \S+/);
    await expect(option).toHaveAttribute('aria-disabled', 'true');
    await snapshot(admin, 'serve-page-served-preset', option);
    await admin.keyboard.press('Escape');
    await cancelServe(admin);
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
      admin.getByText(/^Serving ".+" on .+ · \S+$/),
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
