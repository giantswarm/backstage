import { expect, open, test } from './fixtures';

/**
 * A kagent API denial names its reason (giantswarm/backstage#2360).
 *
 * The person's per-installation token is swapped at the browser for one signed
 * with a key the lab Dex never published; everything after that is real: the
 * portal's backend forwards it, the lab edge's JWT policy refuses it with its
 * own words, and the "Session not started" panel shows them. Before, every
 * refusal read "Not authenticated against the kagent API for installation …",
 * whatever the edge had said.
 */

/** A JWT whose header names a key id no JWKS carries. */
const UNKNOWN_KEY_TOKEN = 'eyJhbGciOiJSUzI1NiIsImtpZCI6ImJvZ3VzIn0.e30.c2ln';
const KAGENT_AUTH_HEADER = 'backstage-kagent-authorization';

test('a refused kagent token shows the edge’s reason when a session does not start', async ({
  admin,
}) => {
  await open(admin, '/agent-platform/agents');
  const grid = admin.getByRole('grid', { name: 'Data table' });
  await expect(grid).toBeVisible();
  const agents = grid.getByRole('rowheader').getByRole('link');
  await agents
    .first()
    .waitFor({ timeout: 30_000 })
    .catch(() => undefined);
  test.skip(
    (await agents.count()) === 0,
    'no agent on the installation — agent-lifecycle.spec.ts creates one; run it first, or create a fixture agent',
  );
  await agents.first().click();
  const start = admin.getByRole('button', { name: 'Start a session' });
  await expect(start).toBeVisible();

  const swapped: string[] = [];
  await admin.route(
    url => url.pathname.endsWith('/kagent/sessions'),
    async route => {
      const request = route.request();
      if (request.method() !== 'POST') {
        await route.fallback();
        return;
      }
      swapped.push(request.url());
      await route.continue({
        headers: {
          ...request.headers(),
          [KAGENT_AUTH_HEADER]: UNKNOWN_KEY_TOKEN,
        },
      });
    },
  );

  await start.click();
  const promptBox = admin.getByRole('textbox', { name: 'Prompt' });
  await expect(promptBox).toBeVisible();
  await promptBox.fill('This session is refused before it starts.');
  await admin.getByRole('button', { name: 'Start', exact: true }).click();

  const dialog = admin.getByRole('dialog', { name: 'New session' });
  await expect(dialog.getByText('Session not started')).toBeVisible();
  const message = dialog.getByText(
    /^Not authenticated against the kagent API for installation/,
  );
  await expect(message).toContainText(
    'Not authenticated against the kagent API for installation',
  );
  await expect(
    message,
    'the edge’s own reason, not only the portal’s wording',
  ).toContainText('authentication failure: token uses the unknown key "bogus"');
  expect(swapped, 'the create went through the portal once').toHaveLength(1);
  await expect(promptBox, 'the prompt is kept for a retry').toHaveValue(
    'This session is refused before it starts.',
  );
  if (process.env.AGENTLAB_E2E_SCREENSHOTS) {
    await admin.screenshot({
      path: `${process.env.AGENTLAB_E2E_SCREENSHOTS}/kagent-denial-reason.png`,
    });
  }
});
