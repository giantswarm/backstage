import { expect, open, test } from './fixtures';
import { lab } from './lab';

/**
 * An installation the Sessions page cannot read names why, and the request id
 * to trace it by (giantswarm/backstage#2775).
 *
 * The session list's token is swapped at the browser for one signed with a key
 * the lab Dex never published: what the edge sees when its JWKS is stale after
 * a key rotation. Everything after that is real: the portal's backend forwards
 * it, the lab edge's JWT policy refuses it, and the banner names the failure
 * class and the request id the backend sent. Before, the banner read
 * "Couldn't read 1 installation" with neither.
 */

/** A JWT whose header names a key id no JWKS carries. */
const UNKNOWN_KEY_TOKEN = 'eyJhbGciOiJSUzI1NiIsImtpZCI6ImJvZ3VzIn0.e30.c2ln';
const KAGENT_AUTH_HEADER = 'backstage-kagent-authorization';

test('an unreadable installation names the reason and the request id', async ({
  admin,
}) => {
  const requestIds: string[] = [];
  await admin.route(
    url => url.pathname.endsWith('/kagent/sessions'),
    async route => {
      const request = route.request();
      if (request.method() !== 'GET') {
        await route.fallback();
        return;
      }
      const response = await route.fetch({
        headers: {
          ...request.headers(),
          [KAGENT_AUTH_HEADER]: UNKNOWN_KEY_TOKEN,
        },
      });
      const requestId = response.headers()['x-request-id'];
      if (requestId) {
        requestIds.push(requestId);
      }
      await route.fulfill({ response });
    },
  );

  await open(admin, '/agent-platform/sessions');

  await expect(admin.getByText("Couldn't read 1 installation")).toBeVisible({
    timeout: 60_000,
  });
  const reason = admin.getByText(
    new RegExp(
      `${lab.installation} \\(authentication failed, request id [0-9a-f-]{36}\\)`,
    ),
  );
  await expect(reason).toBeVisible();
  expect(
    requestIds.length,
    'the backend answered a request id',
  ).toBeGreaterThan(0);
  await expect(
    reason,
    'the banner names the id the backend answered',
  ).toContainText(requestIds[requestIds.length - 1]);
  if (process.env.AGENTLAB_E2E_SCREENSHOTS) {
    await admin.screenshot({
      path: `${process.env.AGENTLAB_E2E_SCREENSHOTS}/sessions-unreadable-reason.png`,
    });
  }
});
