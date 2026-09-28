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
 * model-manager's `list_nodes` reports accelerator nodes only, and the kind
 * node has none: the spec adds the kind node (`AGENTLAB_KIND_NODE`, default
 * `agentlab-control-plane`) to the kserve inventory the page reads, without
 * figures. Everything after it is the lab's own: `check_fit` pinned to the
 * node, `load_model` with `node`, the pin model-manager writes.
 *
 * Stops the lab preset first when it serves; leaves it served. Skipped
 * without the serving slice.
 */

const PRESET = 'qwen2-5-0-5b-cpu';
const PRESET_LABEL = /Qwen2\.5 0\.5B Instruct \(CPU\)/;
const TARGET = /· KServe$/;
const KIND_NODE = process.env.AGENTLAB_KIND_NODE ?? 'agentlab-control-plane';

/** Adds the kind node to every `nodes` list of a muster answer, JSON text included. */
function withKindNode(value: unknown): unknown {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return typeof parsed === 'object' && parsed !== null
        ? JSON.stringify(withKindNode(parsed))
        : value;
    } catch {
      return value;
    }
  }
  if (Array.isArray(value)) {
    return value.map(withKindNode);
  }
  if (typeof value === 'object' && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] =
        key === 'nodes' && Array.isArray(item)
          ? [
              ...item,
              {
                name: KIND_NODE,
                backend: 'kserve',
                ready: true,
                eligible: true,
                gpuCount: 1,
              },
            ]
          : withKindNode(item);
    }
    return out;
  }
  return value;
}

async function addKindNodeToInventory(page: Page) {
  await page.route('**/api/muster/call**', async route => {
    if (!route.request().postData()?.includes('x_model-manager_list_nodes')) {
      await route.fallback();
      return;
    }
    const response = await route.fetch();
    let body: unknown;
    try {
      body = JSON.parse(await response.text());
    } catch {
      // Not JSON (muster between sessions): the answer as it came.
      await route.fulfill({ response });
      return;
    }
    await route.fulfill({ response, json: withKindNode(body) });
  });
}
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
    await addKindNodeToInventory(admin);
    await open(admin, '/agent-platform/models/serving');
    await expect(admin.getByRole('article').first()).toBeVisible();
  });

  test('the Node field offers any node and each node; the pick is the verdict and the pin', async ({
    admin,
  }) => {
    // A served preset cannot be served again: stop it first. The KServe
    // card and its rows arrive after the page, so wait for them first.
    const row = presetRow(admin);
    await row
      .first()
      .waitFor({ timeout: 30_000 })
      .catch(() => undefined);
    if ((await row.count()) > 0) {
      await row.getByRole('button', { name: `Actions for ${PRESET}` }).click();
      await admin.getByRole('menuitem', { name: /^Stop serving/ }).click();
      await admin
        .getByRole('dialog', { name: `Stop serving "${PRESET}"?` })
        .getByRole('button', { name: 'Stop serving' })
        .click();
      await expect(row).toHaveCount(0, { timeout: 60_000 });
      // A fresh page: the dialog judges "serves already" from the served list.
      await open(admin, '/agent-platform/models/serving');
      await expect(admin.getByRole('article').first()).toBeVisible();
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
    await expect(
      admin.getByRole('option', { name: /Any node that fits/ }),
    ).toBeVisible();
    const nodeOption = admin.getByRole('option', {
      name: new RegExp(KIND_NODE),
    });
    await expect(nodeOption).toBeEnabled();
    await snapshot(admin, 'serve-node-options', admin.getByRole('listbox'));
    const node = KIND_NODE;
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
      admin.getByText(new RegExp(`^Serving ".+" on .+ · ${node} — `)),
      'the toast names the chosen node',
    ).toBeVisible();

    await expect(presetRow(admin)).toContainText('Ready', {
      timeout: 8 * 60_000,
    });
    await expect(presetRow(admin)).toContainText(node);
    await snapshot(admin, 'serve-node-row', presetRow(admin));
  });
});
