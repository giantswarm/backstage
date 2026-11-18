import type { Locator, Page } from '@playwright/test';
import { connectToMuster, expect, open, test } from './fixtures';
import { lab } from './lab';
import {
  KUBECONFIG,
  kubectl,
  NEEDS_KUBECONFIG,
  PLATFORM_NAMESPACE,
} from './kubectl';

/**
 * The muster plugin's definition-editor dialog as the shell offers it: an
 * ad-hoc connector's **Edit as JSON…** (its page's More actions) — Validate as
 * a live muster call, a parse error shown on the editor in place of the last
 * success and cleared as soon as the text parses, and the dialog that cannot
 * be closed while a call is in flight. (Workflows are read-only in the shell,
 * so its YAML twin for workflows is offered nowhere there; `workflows.spec.ts`
 * pins that.)
 *
 * The shell offers Edit as JSON only for a connector its Add connector wizard
 * cannot edit, and every connector the lab ships is one it can. So the spec
 * applies its own: a remote server carrying a token-exchange block (disabled)
 * the wizard has no field for, suspended so muster never dials it. muster
 * finds its definition valid; it is only validated, never saved.
 */

const SERVER = 'e2e-definition-editor';

const FIXTURE = `
apiVersion: muster.giantswarm.io/v1alpha1
kind: MCPServer
metadata:
  name: ${SERVER}
  namespace: ${PLATFORM_NAMESPACE}
spec:
  type: streamable-http
  url: http://${SERVER}.invalid/mcp
  description: Edited as JSON by the definition-editor spec; never dialled
  suspended: true
  auth:
    tokenExchange:
      enabled: false
`;

const deleteFixture = () =>
  kubectl([
    '-n',
    PLATFORM_NAMESPACE,
    'delete',
    'mcpserver',
    SERVER,
    '--ignore-not-found',
  ]).catch(() => undefined);

test.skip(!KUBECONFIG, NEEDS_KUBECONFIG);
test.beforeAll(async () => {
  await kubectl(['apply', '-f', '-'], FIXTURE);
});
test.afterAll(deleteFixture);

const MUSTER_CALL = /\/api\/muster\/call(\?|$)/;

/**
 * Holds every muster tool call until the returned function is called, so a
 * test can act on the dialog while a call is in flight. Released, the route
 * passes every later call straight through.
 */
async function holdMusterCalls(page: Page): Promise<() => void> {
  let release: () => void = () => {};
  const held = new Promise<void>(resolve => (release = resolve));
  await page.route(MUSTER_CALL, async route => {
    await held;
    await route.continue();
  });
  return release;
}

/** Escape, the header's close button and the footer's Close, while busy. */
async function expectLockedWhileBusy(dialog: Locator, page: Page) {
  const [headerClose, footerClose] = [
    dialog.getByRole('button', { name: 'Close' }).first(),
    dialog.getByRole('button', { name: 'Close' }).last(),
  ];
  await expect(footerClose).toBeDisabled();
  await page.keyboard.press('Escape');
  await headerClose.click();
  await expect(
    dialog,
    'the dialog stays open while a call is in flight',
  ).toBeVisible();
}

test("an ad-hoc server's Edit as JSON validates, shows a parse error and stays open while busy", async ({
  admin,
}) => {
  test.setTimeout(120_000);
  const server = SERVER;
  await open(admin, `/customize/connectors/${lab.installation}/${server}`);
  const moreActions = admin.getByRole('button', { name: 'More actions' });
  await connectToMuster(admin, moreActions);
  const editAsJson = async () => {
    await moreActions.click();
    await admin.getByRole('menuitem', { name: /^Edit as JSON/ }).click();
  };
  await editAsJson();

  const dialog = admin.getByRole('dialog');
  const editor = dialog.getByRole('textbox', {
    name: 'Connector definition (JSON)',
  });
  await expect(
    dialog.getByRole('heading', { name: `Edit as JSON — ${server}` }),
  ).toBeVisible();
  await expect(editor).toHaveValue(new RegExp(`"name": "${server}"`));

  const release = await holdMusterCalls(admin);
  await dialog.getByRole('button', { name: 'Validate' }).click();
  await expectLockedWhileBusy(dialog, admin);
  release();
  // The call settles (its buttons are back) before the text changes, so what
  // follows is judged on the edited text alone.
  await expect(dialog.getByRole('button', { name: 'Validate' })).toBeEnabled({
    timeout: 30_000,
  });
  await expect(dialog.getByText('Definition is valid.')).toBeVisible();
  // Whatever muster answered, a call's outcome never marks the text invalid.
  await expect(editor).not.toHaveAttribute('aria-invalid', 'true');

  await editor.fill('{ "name": ');
  await dialog.getByRole('button', { name: 'Validate' }).click();
  await expect(dialog.getByText(/^Invalid JSON: /)).toBeVisible();
  await expect(dialog.getByText('Definition is valid.')).toBeHidden();
  await expect(editor).toHaveAttribute('aria-invalid', 'true');
  await expect(editor, 'the blocked call focuses the editor').toBeFocused();
  // Fixed, the error goes at once, without another Validate.
  await editor.fill(`{ "name": "${server}" }`);
  await expect(editor).not.toHaveAttribute('aria-invalid', 'true');
  await expect(dialog.getByText(/^Invalid JSON: /)).toBeHidden();

  // Not busy: Escape closes it — after "Discard changes", since the text
  // differs from the server's — and it opens again on the server's definition.
  await admin.keyboard.press('Escape');
  const discard = admin.getByRole('dialog', { name: 'Discard your changes?' });
  await discard.getByRole('button', { name: 'Discard changes' }).click();
  await expect(dialog).toHaveCount(0);
  await editAsJson();
  await expect(editor).toHaveValue(new RegExp(`"name": "${server}"`));
  await expect(dialog.getByText(/^Invalid JSON: /)).toBeHidden();
  await admin.keyboard.press('Escape');
});
