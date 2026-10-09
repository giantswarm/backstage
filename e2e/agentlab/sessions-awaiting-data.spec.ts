import { expect, open, test } from './fixtures';

/**
 * The Sessions page shows loading, not its empty state, while a failed read
 * waits to retry (giantswarm/backstage#2810).
 *
 * The first session list answers 500 and the browser goes offline with it, so
 * react-query's retry is paused: the query is pending, not `isLoading`. The
 * page must keep its skeleton rather than claim there are no sessions (the "Start your first session"
 * card, or "No sessions found." beside rows); coming
 * back online lets the retry through to the real answer.
 */
test('a failed read whose retry waits shows loading, not the first-session state', async ({
  admin,
  labAgent,
}) => {
  // With no agent the page is the first-agent invitation, whatever the read says.
  expect(labAgent.detailPath).toBeTruthy();

  const emptyState = admin.getByText('Start your first session');
  let failed = false;
  await admin.route(
    url => url.pathname.endsWith('/kagent/sessions'),
    async route => {
      if (route.request().method() !== 'GET' || failed) {
        await route.fallback();
        return;
      }
      failed = true;
      await route.fulfill({ status: 500, body: 'Internal Server Error' });
      await admin.context().setOffline(true);
    },
  );

  await open(admin, '/agent-platform/sessions');
  await expect.poll(() => failed, { timeout: 60_000 }).toBe(true);

  // Long enough for a wrongly released empty state to render.
  await admin.waitForTimeout(3_000);
  await expect(emptyState).toBeHidden();
  await expect(admin.getByRole('progressbar')).toBeVisible();
  if (process.env.AGENTLAB_E2E_SCREENSHOTS) {
    await admin.screenshot({
      path: `${process.env.AGENTLAB_E2E_SCREENSHOTS}/sessions-awaiting-data-paused.png`,
    });
  }

  await admin.context().setOffline(false);
  await expect(emptyState).toBeVisible({ timeout: 60_000 });
});
