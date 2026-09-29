import { expect, open, test } from './fixtures';
import { lab } from './lab';
import type { Page } from '@playwright/test';

/**
 * The State column on the sessions list (giantswarm/giantswarm#37363).
 *
 * Deriving a session's state used to mean reading its whole conversation, one
 * request per row, so the list could say nothing about what a session was
 * doing. On kagent API v2 the backend reads each session's task list **status
 * only** and answers one summary for the caller (`GET /kagent/session-states`),
 * which the switcher rail already groups by; this column renders the same
 * summary as a sortable cell.
 *
 * **The first test is entirely real** — a session started through the portal on
 * the lab's kagent, and the state the backend derives for it. **The second
 * stubs the two reads behind the list**, because the three ways a state can go
 * missing are failures the lab cannot be asked to produce: a task read that
 * fails, a session that reported no state at all, and one the summary never
 * evaluated. Everything below the stub is the shipped code.
 */

const prompt = 'Say hello in one word.';

/**
 * Full-page screenshots of the states this spec reaches, when a directory is
 * given (`AGENTLAB_E2E_SCREENSHOTS=<dir>`): what the PR shows a reviewer. Off
 * by default — the suite's own screenshots are its failure evidence.
 */
async function snapshot(page: Page, name: string): Promise<void> {
  const dir = process.env.AGENTLAB_E2E_SCREENSHOTS;
  if (!dir) {
    return;
  }
  await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
}

/** Deletes the session on screen through its actions menu — the portal's own path. */
async function deleteCurrentSession(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Session actions' }).click();
  await page.getByRole('menuitem', { name: /Delete session/ }).click();
  const dialog = page.getByRole('dialog', { name: /Delete session/ });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Delete session' }).click();
  await expect(page).toHaveURL(/\/agent-platform\/sessions$/, {
    timeout: 60_000,
  });
}

/** The labels `describeSessionState` can render for a session that has run. */
const STATE_LABELS = [
  'Submitted',
  'Working',
  'Waiting for input',
  'Authentication required',
  'Completed',
  'Failed',
  'Canceled',
  'Rejected',
];

test('a session started in the portal reports its state on the list', async ({
  admin,
}) => {
  test.setTimeout(6 * 60_000);

  // --- An agent to start from --------------------------------------------
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
  await expect(
    admin.getByRole('button', { name: 'Start a session' }),
  ).toBeVisible();

  let sessionPath: string | undefined;
  let failure: unknown;
  try {
    // --- A session of its own, so the row asserted on is this test's ------
    await admin.getByRole('button', { name: 'Start a session' }).click();
    const promptBox = admin.getByRole('textbox', { name: 'Prompt' });
    await expect(promptBox).toBeVisible();
    await promptBox.fill(prompt);
    await admin.getByRole('button', { name: 'Start', exact: true }).click();
    await expect(admin).toHaveURL(
      new RegExp(`/agent-platform/sessions/${lab.installation}/[^/]+$`),
      { timeout: 60_000 },
    );
    sessionPath = new URL(admin.url()).pathname;
    const sessionId = sessionPath.split('/').pop()!;

    // The turn is dispatched by the detail page, so wait for it to settle here
    // before reading the list. A session left before its first turn runs is
    // genuinely stateless — the list says `No activity yet` for it, which is a
    // different assertion from the one this test makes.
    await expect(
      admin
        .getByTestId('timeline-turn-failed')
        .or(admin.getByTestId('timeline-agent-message')),
      'the first turn settles, one way or the other',
    ).toBeVisible({ timeout: 3 * 60_000 });

    // --- The list says what it is doing -----------------------------------
    await open(admin, '/agent-platform/sessions');
    await expect(
      admin.getByRole('columnheader', { name: /State/ }),
      'the list has a State column',
    ).toBeVisible();

    // Found by the id in the row's link, never by the title: kagent derives a
    // session's title from the conversation rather than from the prompt sent —
    // a session started with "Say hello in one word." came back titled "hello".
    const row = admin
      .getByRole('row')
      .filter({ has: admin.locator(`a[href$="/${sessionId}"]`) });

    // The state is the backend's, derived from the task kagent recorded: which
    // one depends on whether the lab's model answered, so the assertion is that
    // the cell says one of the things a state can be — never that it is blank.
    const stateCell = row.first().getByText(new RegExp(STATE_LABELS.join('|')));
    await expect(
      stateCell,
      'the row carries a state the backend derived',
    ).toBeVisible({ timeout: 90_000 });
    await snapshot(admin, 'state-column-live');

    // --- Sorting by it ----------------------------------------------------
    await admin.getByRole('columnheader', { name: /State/ }).click();
    await expect(
      admin.getByRole('columnheader', { name: /State/ }),
      'the column sorts, so what needs a person can come to the top',
    ).toHaveAttribute('aria-sort', /ascending|descending/);
  } catch (error) {
    failure = error;
  }

  // --- Clean up: the session, through the portal --------------------------
  if (sessionPath) {
    try {
      await open(admin, sessionPath);
      await deleteCurrentSession(admin);
    } catch (cleanupError) {
      if (failure === undefined) {
        throw cleanupError;
      }
      if (failure instanceof Error) {
        failure.message += `\n\n[cleanup] deleting ${sessionPath} through the portal failed too: ${String(cleanupError)}`;
      }
    }
  }
  if (failure !== undefined) {
    throw failure;
  }
});

test('the list distinguishes the three ways a state can be missing', async ({
  admin,
}) => {
  test.setTimeout(3 * 60_000);

  // Four sessions, one per outcome the column renders differently. Both reads
  // behind the list are answered here: a failed task read and a session the
  // summary never evaluated are not states the lab can be put into.
  const instance = (id: string, name: string) => ({
    id,
    creator: 'admin@lab.local',
    harness: { namespace: 'kagent', name: 'kagent' },
    agentTemplate: { namespace: 'kagent', name: 'e2e-state-column' },
    state: 'AGENT_INSTANCE_STATE_READY',
    createdAt: '2026-09-18T09:00:00Z',
    updatedAt: '2026-09-18T09:05:00Z',
    name,
    contextId: `ctx-${id}`,
  });

  await admin.route(
    url => url.pathname.endsWith('/kagent/sessions'),
    async route => {
      if (route.request().method() !== 'GET') {
        await route.fallback();
        return;
      }
      await route.fulfill({
        json: {
          agentInstances: [
            instance('e2e-waiting', 'Waiting on a human'),
            instance('e2e-idle', 'Never run'),
            instance('e2e-unreadable', 'Could not be read'),
            instance('e2e-unevaluated', 'Never evaluated'),
          ],
        },
      });
    },
  );

  await admin.route(
    url => url.pathname.endsWith('/kagent/session-states'),
    async route => {
      await route.fulfill({
        json: {
          evaluatedAt: Date.now(),
          states: [
            { sessionId: 'e2e-waiting', state: 'input-required', changedAt: 1 },
            // Evaluated, and no turn reported a state: created and never run.
            { sessionId: 'e2e-idle', state: null },
          ],
          // The read failed, so the state is genuinely unknown.
          unreadable: ['e2e-unreadable'],
          // And one the summary never looked at at all.
          skipped: 1,
        },
      });
    },
  );

  await open(admin, '/agent-platform/sessions');

  await expect(
    admin.getByRole('row').filter({ hasText: 'Waiting on a human' }),
    'a state kagent reported is named',
  ).toContainText('Waiting for input');

  await expect(
    admin.getByRole('row').filter({ hasText: 'Never run' }),
    'a session that reported no state says so, rather than looking finished',
  ).toContainText('No activity yet');

  const unknown = admin
    .getByRole('row')
    .filter({ hasText: 'Could not be read' });
  await expect(
    unknown,
    'a read that failed is unknown, which is not the same as terminal',
  ).toContainText('Unknown');
  await expect(
    unknown.getByTitle(/not the same as finished/),
    'and says so on hover',
  ).toBeVisible();

  await expect(
    admin
      .getByRole('row')
      .filter({ hasText: 'Never evaluated' })
      .getByText('Not loaded'),
    'a session nobody asked about says so in words instead of claiming anything',
  ).toHaveAttribute('title', 'Open the session to see its state.');

  await snapshot(admin, 'state-column-missing-states');

  await admin.unrouteAll({ behavior: 'ignoreErrors' });
});
