import { expect, openReadyAgent, startSessionButton, test } from './fixtures';

/**
 * A kagent API denial names its reason (giantswarm/backstage#2360).
 *
 * The session starts through agent-manager's start_session, which never sees
 * the kagent token; the first kagent call is the session page's send of the
 * first message. That send's per-installation token is swapped at the browser
 * for one signed with a key the lab Dex never published; everything after that
 * is real: the portal's backend forwards it, the lab edge's JWT policy refuses
 * it with its own words, and the "Message not sent" notice shows them. Before,
 * every refusal read "Not authenticated against the kagent API for
 * installation …", whatever the edge had said.
 */

/** A JWT whose header names a key id no JWKS carries. */
const UNKNOWN_KEY_TOKEN = 'eyJhbGciOiJSUzI1NiIsImtpZCI6ImJvZ3VzIn0.e30.c2ln';
const KAGENT_AUTH_HEADER = 'backstage-kagent-authorization';

test('a refused kagent token shows the edge’s reason when the first message is not sent', async ({
  admin,
  labAgent,
}) => {
  test.setTimeout(8 * 60_000);
  await openReadyAgent(admin, labAgent);
  const start = startSessionButton(admin);

  const swapped: string[] = [];
  await admin.route(
    url => url.pathname.endsWith('/messages/stream'),
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

  await expect(admin).toHaveURL(/\/agent-platform\/sessions\/[^/]+\/[^/]+$/, {
    timeout: 60_000,
  });
  await expect(admin.getByText('Message not sent')).toBeVisible({
    timeout: 60_000,
  });
  const message = admin.getByText(
    /^Not authenticated against the kagent API for installation/,
  );
  await expect(message).toContainText(
    'Not authenticated against the kagent API for installation',
  );
  await expect(
    message,
    'the edge’s own reason, not only the portal’s wording',
  ).toContainText('authentication failure: token uses the unknown key "bogus"');
  expect(swapped, 'the first send went through the portal once').toHaveLength(
    1,
  );
  await expect(
    admin.getByRole('textbox', { name: 'Message' }),
    'the prompt is kept for a retry',
  ).toHaveValue('This session is refused before it starts.');
  if (process.env.AGENTLAB_E2E_SCREENSHOTS) {
    await admin.screenshot({
      path: `${process.env.AGENTLAB_E2E_SCREENSHOTS}/kagent-denial-reason.png`,
    });
  }
});
