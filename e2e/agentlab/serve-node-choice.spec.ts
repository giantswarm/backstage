import type { Locator, Page } from '@playwright/test';
import { expect, open, test } from './fixtures';
import { lab } from './lab';

/**
 * The Serve dialog's Node field against the lab's KServe backend
 * (`platform.serving`: the CPU preset `qwen2-5-0-5b-cpu`), as the admin:
 *
 * - no node ticked, and the verdict then names the nodes the model may land
 *   on — never one node the request does not pin;
 * - each node is offered with its free budget; ticking one turns the
 *   verdict into "will be placed on <node>", and Serve sends it as `node`
 *   (the LLMInferenceService carries the hostname pin — checked with kubectl
 *   outside this spec);
 * - ticking two ("All 2 nodes that fit") asks one `check_fit` with
 *   `placement: copies` and both `nodes`, and its verdict is the dialog's:
 *   the lab's model-manager refuses the second node, which does not exist,
 *   so Serve stays disabled.
 *
 * model-manager's `list_nodes` reports accelerator nodes only, and the kind
 * node has none: the spec adds the kind node (`lab.kindNode`) and a phantom
 * second node to the kserve
 * inventory the page reads, without figures. The phantom's own `check_fit`
 * is answered with the kind node's, so it is offered like a node that fits.
 * Everything else is the lab's own: `check_fit` pinned to the node, the
 * copies `check_fit`, `load_model` with `node`, the pin model-manager writes.
 *
 * Stops the lab preset first when it serves; leaves it served. Skipped
 * without the serving slice.
 */

const PRESET = 'qwen2-5-0-5b-cpu';
const PRESET_LABEL = /Qwen2\.5 0\.5B Instruct \(CPU\)/;
const TARGET = /· KServe$/;
const KIND_NODE = lab.kindNode;
const PHANTOM_NODE = 'agentlab-phantom';

function inventoryNode(name: string) {
  return { name, backend: 'kserve', ready: true, eligible: true, gpuCount: 1 };
}

/** Adds the kind and the phantom node to every `nodes` list of a muster answer, JSON text included. */
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
          ? [...item, inventoryNode(KIND_NODE), inventoryNode(PHANTOM_NODE)]
          : withKindNode(item);
    }
    return out;
  }
  return value;
}

async function addNodesToInventory(page: Page) {
  await page.route('**/api/muster/call**', async route => {
    const call = route.request().postDataJSON() as
      { name?: string; arguments?: Record<string, unknown> } | undefined;
    if (
      call?.name === 'x_model-manager_check_fit' &&
      call.arguments?.node === PHANTOM_NODE
    ) {
      // The phantom fits like the kind node: its verdict, renamed.
      const response = await route.fetch({
        postData: JSON.stringify({
          ...call,
          arguments: { ...call.arguments, node: KIND_NODE },
        }),
      });
      await route.fulfill({
        response,
        body: (await response.text()).replaceAll(KIND_NODE, PHANTOM_NODE),
      });
      return;
    }
    if (call?.name !== 'x_model-manager_list_nodes') {
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

test.describe.serial('Serve on the ticked nodes', () => {
  test.setTimeout(10 * 60_000);

  test.beforeEach(async ({ admin }) => {
    await addNodesToInventory(admin);
    await open(admin, '/agent-platform/models/serving');
    await expect(admin.getByRole('article').first()).toBeVisible();
  });

  test('the Nodes checklist: two ticks are one copies verdict, one tick the pin', async ({
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

    const nodes = dialog.getByTestId('serve-nodes');
    const nodeBox = nodes.getByRole('checkbox', {
      name: new RegExp(KIND_NODE),
    });
    const phantomBox = nodes.getByRole('checkbox', {
      name: new RegExp(PHANTOM_NODE),
    });
    await expect(nodeBox).not.toBeChecked();
    await expect(nodeBox).toBeEnabled({ timeout: 60_000 });
    await expect(phantomBox).toBeEnabled({ timeout: 60_000 });

    // Two ticks: one copy on each, judged together by the lab.
    await nodes.getByRole('button', { name: 'All 2 nodes that fit' }).click();
    await expect(nodeBox).toBeChecked();
    await expect(phantomBox).toBeChecked();
    await expect(
      verdict,
      'the copies check_fit, refusing the phantom',
    ).toContainText(PHANTOM_NODE, { timeout: 60_000 });
    await expect(verdict).toContainText('cannot host a copy');
    await snapshot(admin, 'serve-node-copies', dialog);
    await expect(
      dialog.getByRole('button', { name: 'Serve', exact: true }),
    ).toBeDisabled();

    // One tick: the pin.
    // The label, as a person clicks it: the input itself is visually hidden.
    await nodes.getByText(PHANTOM_NODE, { exact: true }).click();
    await expect(phantomBox).not.toBeChecked();
    await snapshot(admin, 'serve-node-options', nodes);
    const node = KIND_NODE;

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
