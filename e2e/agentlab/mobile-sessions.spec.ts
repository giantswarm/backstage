import type { Locator, Page } from '@playwright/test';
import {
  expect,
  expectClearOfBottomBar,
  expectNoHorizontalScroll,
  open,
  openReadyAgent,
  sessionActionsButton,
  test,
} from './fixtures';

/**
 * Sessions on a phone (wave 2A): a session started from the home screen with
 * a two-line message — on touch, Return breaks the line and only Start/Send
 * sends (T22 B2) — the composer above the bottom bar on both screens, and the
 * Sessions list as stacked rows whose titles read in full, not the desktop
 * table squeezed to a 31px title column (B1). The session is the worker's
 * own agent's and is deleted again through the portal.
 */

/** The "Show tool activity" switch on the session's start line (S9). */
function toolActivitySwitch(page: Page): Locator {
  return page.getByRole('switch', { name: 'Show tool activity', exact: true });
}

/**
 * Its label, the part a person presses. The full header's: the compact
 * header repeats the switch after it in the document (hidden at phone width).
 */
function toolActivityLabel(page: Page): Locator {
  return page.getByText('Show tool activity', { exact: true }).first();
}

/** Turns the switch back on, if the page shows it at all. */
async function restoreToolActivity(page: Page): Promise<void> {
  const toolActivity = toolActivitySwitch(page);
  if ((await toolActivity.count()) > 0 && !(await toolActivity.isChecked())) {
    await toolActivityLabel(page).click();
    await expect(toolActivity).toBeChecked();
  }
}

/**
 * Answers the open session's conversation read with one tool call and its
 * result added to the newest turn, as the artifacts kagent records them, then
 * `more` artifacts. The rest of the read is the lab's own.
 */
async function withToolCall(page: Page, more: unknown[] = []): Promise<void> {
  const sessionId = new URL(page.url()).pathname.split('/').pop();
  await page.route(
    url => url.pathname.endsWith(`/kagent/sessions/${sessionId}/tasks`),
    async route => {
      const response = await route.fetch();
      if (!response.ok()) {
        await route.fulfill({ response });
        return;
      }
      const body = (await response.json()) as {
        tasks?: { artifacts?: unknown[] }[];
      };
      const newest = body.tasks?.[body.tasks.length - 1];
      if (newest) {
        newest.artifacts = [
          ...(newest.artifacts ?? []),
          {
            artifactId: 'e2e-tool-call',
            parts: [
              {
                data: { id: 'e2e-call-1', name: 'e2e_lookup', args: {} },
                metadata: { adk_type: 'function_call' },
              },
            ],
          },
          {
            artifactId: 'e2e-tool-result',
            parts: [
              {
                data: {
                  id: 'e2e-call-1',
                  name: 'e2e_lookup',
                  response: { output: 'ready' },
                },
                metadata: { adk_type: 'function_response' },
              },
            ],
          },
          ...more,
        ];
      }
      await route.fulfill({ response, json: body });
    },
  );
}

/** An agent reply several screens long, as a text artifact. */
const longReply = {
  artifactId: 'e2e-long-reply',
  parts: [
    {
      text: Array.from(
        { length: 30 },
        (_, index) =>
          `Paragraph ${index + 1} of a reply longer than the screen.`,
      ).join('\n\n'),
    },
  ],
};

/** Where `locator` starts in the document, whatever the scroll. */
function documentTop(locator: Locator): Promise<number> {
  return locator.evaluate(
    element => element.getBoundingClientRect().top + window.scrollY,
  );
}

async function deleteCurrentSession(page: Page): Promise<void> {
  await sessionActionsButton(page).click();
  await page.getByRole('menuitem', { name: /Delete session/ }).click();
  const dialog = page.getByRole('dialog', { name: /Delete session/ });
  await expect(dialog).toBeVisible();
  // Right after a turn kagent refuses the delete until the runtime's cleanup
  // settles ("not yet settled: precondition failed", shown in the dialog);
  // a person tries again a little later, and so does this.
  await expect
    .poll(
      async () => {
        if (!(await dialog.isVisible())) {
          return 'deleted';
        }
        await dialog
          .getByRole('button', { name: 'Delete session' })
          .click({ timeout: 5_000 })
          .catch(() => undefined);
        return 'refused';
      },
      { timeout: 120_000, intervals: [10_000] },
    )
    .toBe('deleted');
  await expect(page).toHaveURL(/\/agent-platform\/sessions$/, {
    timeout: 60_000,
  });
}

test('a session starts from the home screen with a two-line message, its composer clear of the bar', async ({
  admin,
  labAgent,
}) => {
  test.setTimeout(10 * 60_000);
  await openReadyAgent(admin, labAgent);

  await open(admin, '/');
  const prompt = admin.getByRole('textbox', { name: 'Prompt' });
  await expect(prompt).toBeVisible();
  await expectNoHorizontalScroll(admin, 'the home screen');

  // The composer's agent picker (labelled "Select agent", T89): its trigger
  // reads the placeholder or the agent chosen, then its name, Agent.
  await admin
    .getByRole('button', { name: /(^| )Agent$/ })
    .first()
    .click();
  await admin
    .getByRole('option', { name: new RegExp(labAgent.name) })
    .first()
    .click();

  // Return on a soft keyboard is a newline, never a send.
  await prompt.click();
  await admin.keyboard.type('Answer with the word ready.');
  await admin.keyboard.press('Enter');
  await admin.keyboard.type('Nothing else.');
  await expect(prompt).toHaveValue(
    'Answer with the word ready.\nNothing else.',
  );
  await expect(admin, 'Return did not send').toHaveURL(/\/$/);

  const start = admin.getByRole('button', { name: 'Start', exact: true });
  await expectClearOfBottomBar(admin, start, 'Start');
  await start.click();
  await expect(admin).toHaveURL(/\/agent-platform\/sessions\/[^/]+\/[^/]+$/, {
    timeout: 60_000,
  });

  try {
    // The first message, both lines of it.
    await expect(admin.getByText('Nothing else.').first()).toBeVisible({
      timeout: 60_000,
    });
    const message = admin.getByRole('textbox', { name: /Message|Prompt/ });
    await expect(message).toBeVisible();
    await expectClearOfBottomBar(admin, message, 'the session composer');
    await expectNoHorizontalScroll(admin, 'the session page');

    // The "Show tool activity" switch (S9) wraps with the start line,
    // and off leaves the conversation without its work summaries. The lab
    // agent has no tools, so the session's conversation read is answered
    // with one tool call added, in the shape kagent records it.
    await expect(
      admin.getByTestId('timeline-agent-message').first(),
      'the turn finished',
    ).toBeVisible({ timeout: 180_000 });
    await withToolCall(admin);
    await admin.reload();
    await expect(admin.getByText('Nothing else.').first()).toBeVisible({
      timeout: 60_000,
    });

    const toolActivity = toolActivitySwitch(admin);
    await expect(toolActivity).toBeAttached();
    if (!(await toolActivity.isChecked())) {
      await toolActivityLabel(admin).click();
    }
    await expect(toolActivity).toBeChecked();
    await expect(admin.getByTestId('timeline-work-summary')).toHaveCount(1);

    await toolActivityLabel(admin).click();
    await expect(toolActivity).not.toBeChecked();
    await expect(admin.getByTestId('timeline-work-summary')).toHaveCount(0);
    await expect(admin.getByText('Nothing else.').first()).toBeVisible();
    await expectNoHorizontalScroll(
      admin,
      'the session page with tool activity hidden',
    );

    // The compact header (ShellPage's `compactHeader`): with a reply longer
    // than the screen the header scrolls away, and a bar keeps the session's
    // name, state and agent, the pin and the menu at the top of the view,
    // with the composer still docked at the bottom. It hangs over the
    // conversation, so nothing under it moves when it appears.
    await withToolCall(admin, [longReply]);
    await admin.reload();
    await expect(admin.getByText('Paragraph 30 of a reply')).toBeVisible({
      timeout: 60_000,
    });
    const compactHeader = admin.getByTestId('shell-page-compact-header');
    const heading = admin.getByRole('heading', { level: 1 });
    const firstMessage = admin.getByTestId('timeline-user-message').first();

    await admin.evaluate(() => window.scrollTo(0, 0));
    await expect(heading).toBeInViewport();
    await expect(compactHeader).toBeHidden();
    const messageTop = await documentTop(firstMessage);

    await admin.evaluate(() =>
      window.scrollTo(0, document.documentElement.scrollHeight),
    );
    await expect(heading).not.toBeInViewport();
    await expect(compactHeader).toBeVisible();
    expect((await compactHeader.boundingBox())!.y, 'at the top').toBeCloseTo(
      0,
      0,
    );
    await expect(
      compactHeader.getByRole('button', { name: 'Session actions' }),
    ).toBeVisible();
    await expect(
      compactHeader.getByRole('button', { name: /^(Pin|Unpin) session$/ }),
    ).toBeVisible();
    // Not a second h1, and the switch stays with the full header on a phone.
    await expect(compactHeader.getByRole('heading')).toHaveCount(0);
    await expect(compactHeader.getByRole('switch')).toHaveCount(0);
    expect(await documentTop(firstMessage), 'the conversation moved').toBe(
      messageTop,
    );
    await expectClearOfBottomBar(
      admin,
      message,
      'the session composer under the compact header',
    );
    await expectNoHorizontalScroll(
      admin,
      'the session page with the compact header',
    );

    await admin.evaluate(() => window.scrollTo(0, 0));
    await expect(compactHeader).toBeHidden();
    await expect(heading).toBeInViewport();
  } finally {
    // The choice is the admin's for every session and every later spec, so
    // it goes back on whatever failed above.
    try {
      await restoreToolActivity(admin);
    } finally {
      await deleteCurrentSession(admin);
    }
  }
});

test('Sessions lists stacked rows whose titles read in full', async ({
  admin,
}) => {
  await open(admin, '/agent-platform/sessions');
  await expect(
    admin.getByRole('heading', { level: 1, name: 'Sessions' }),
  ).toBeVisible();
  await expectNoHorizontalScroll(admin, 'Sessions');
  // No desktop table at phone width.
  await expect(admin.getByRole('main').getByRole('table')).toHaveCount(0);
  // One stacked list per day; a row is a list item linking to its session.
  const rows = admin
    .getByRole('main')
    .getByRole('listitem')
    .filter({ has: admin.locator('a[href*="/agent-platform/sessions/"]') });
  await rows
    .first()
    .waitFor({ timeout: 60_000 })
    .catch(() => undefined);
  test.skip(
    (await rows.count()) === 0,
    'the admin has no session on this lab to list',
  );
  const title = rows
    .first()
    .locator('a[href*="/agent-platform/sessions/"]')
    .first();
  const box = await title.boundingBox();
  expect(
    box!.width,
    'the title takes the row, not a 31px column',
  ).toBeGreaterThan(150);
});
