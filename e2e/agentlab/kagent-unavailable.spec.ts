import type { Page, Route } from '@playwright/test';
import {
  deleteCurrentSession,
  expect,
  open,
  openReadyAgent,
  startSessionButton,
  test,
} from './fixtures';
import { lab } from './lab';

/**
 * kagent down for a moment (giantswarm/giantswarm#39044).
 *
 * On gazelle the kagent controller was preempted for 2.5 minutes, and its
 * gateway answered every call with gRPC `Unavailable` ("upstream call failed:
 * Connect: Connection refused"). The portal showed a sent message as "failed
 * with status 500" and the session list as "No sessions yet".
 *
 * **The backend's answer is stubbed at the browser**, in the shape it gives
 * for that outage: a 500 `UpstreamError` with `reason: "unavailable"`. Taking
 * the lab's controller down would break every other spec running against it.
 * Everything else is real: once the stub is lifted, Try again and Send reach
 * the lab's kagent.
 */

/** The agent-platform backend's answer while kagent is unavailable. */
function unavailable(route: Route): Promise<void> {
  return route.fulfill({
    status: 500,
    contentType: 'application/json',
    json: {
      error: {
        name: 'UpstreamError',
        message: `The kagent API for installation '${lab.installation}' is unavailable: upstream call failed: Connect: Connection refused (os error 111)`,
        reason: 'unavailable',
      },
    },
  });
}

/**
 * Full-page screenshots of the states this spec reaches, when a directory is
 * given (`AGENTLAB_E2E_SCREENSHOTS=<dir>`).
 */
async function snapshot(page: Page, name: string): Promise<void> {
  const dir = process.env.AGENTLAB_E2E_SCREENSHOTS;
  if (!dir) {
    return;
  }
  await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
}

test('a session list kagent could not answer is an error with a retry, not an empty list', async ({
  admin,
}) => {
  const isSessionList = (url: URL) => url.pathname.endsWith('/kagent/sessions');
  const stub = async (route: Route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    await unavailable(route);
  };
  await admin.route(isSessionList, stub);

  await open(admin, '/sessions');

  const error = admin
    .getByRole('alert')
    .filter({ hasText: 'Could not read your sessions' });
  // Long enough for react-query's own retries to give up.
  await expect(error).toBeVisible({ timeout: 60_000 });
  await expect(error).toContainText(
    `The sessions could not be read on ${lab.installation} (temporarily unavailable`,
  );
  // The page's own empty state, not the rail's session list, which says the
  // same.
  const content = admin.getByRole('main');
  await expect(
    content.getByText('No sessions yet', { exact: true }),
  ).toHaveCount(0);
  await snapshot(admin, 'kagent-unavailable-sessions');

  // kagent is back: Try again reads the lab's real answer.
  await admin.unroute(isSessionList, stub);
  await error.getByRole('button', { name: 'Try again' }).click();
  await expect(error).toBeHidden({ timeout: 60_000 });
  await expect(
    content
      .getByRole('grid')
      .first()
      .or(content.getByText('No sessions yet', { exact: true })),
    'the retry settles on the real answer',
  ).toBeVisible({ timeout: 60_000 });
});

test('a message kagent could not take says so and stays in the composer', async ({
  admin,
  labAgent,
}) => {
  test.setTimeout(10 * 60_000);
  const prompt = 'Which pods restarted in the last hour?';

  await openReadyAgent(admin, labAgent);

  // The session itself is created through agent-manager, which is not
  // stubbed. Its first message, sent by the session page, meets the outage.
  // The history read that checks whether it landed goes to the lab and finds
  // it missing, as it was during the outage: kagent stored nothing.
  const isTurn = (url: URL) => url.pathname.endsWith('/messages/stream');
  const stub = async (route: Route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    await unavailable(route);
  };
  await admin.route(isTurn, stub);

  let created: string | undefined;
  let failure: unknown;
  try {
    await startSessionButton(admin).click();
    const promptBox = admin.getByRole('textbox', { name: 'Prompt' });
    await expect(promptBox).toBeVisible();
    await promptBox.fill(prompt);
    await admin.getByRole('button', { name: 'Start', exact: true }).click();
    await expect(admin).toHaveURL(
      new RegExp(`/sessions/${lab.installation}/[^/]+$`),
      { timeout: 60_000 },
    );
    created = new URL(admin.url()).pathname;

    const notSent = admin.getByText('Message not sent', { exact: true });
    await expect(notSent).toBeVisible({ timeout: 60_000 });
    await expect(
      admin.getByText(
        'The Agent Platform is temporarily unavailable. Try again in a moment.',
      ),
    ).toBeVisible();
    await expect(admin.getByText(/failed with status 500/)).toHaveCount(0);
    const messageBox = admin.getByRole('textbox', { name: 'Message' });
    await expect(messageBox, 'the message is back in the box').toHaveValue(
      prompt,
    );
    await snapshot(admin, 'kagent-unavailable-message');

    // kagent is back: one press sends it.
    await admin.unroute(isTurn, stub);
    await admin.getByRole('button', { name: 'Send' }).click();
    await expect(notSent).toBeHidden({ timeout: 60_000 });
    await expect(
      admin.getByTestId('timeline-user-message').filter({ hasText: prompt }),
    ).toBeVisible({ timeout: 60_000 });
  } catch (error) {
    failure = error;
  }

  await admin.unroute(isTurn, stub);
  if (created) {
    try {
      await open(admin, created);
      await deleteCurrentSession(admin);
    } catch (cleanupError) {
      if (failure === undefined) {
        throw cleanupError;
      }
      if (failure instanceof Error) {
        failure.message += `\n\n[cleanup] deleting ${created} through the portal failed too: ${String(cleanupError)}`;
      }
    }
  }
  if (failure !== undefined) {
    throw failure;
  }
});
