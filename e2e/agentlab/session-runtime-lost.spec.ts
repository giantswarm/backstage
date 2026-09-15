import { expect, open, test } from './fixtures';
import { lab } from './lab';
import type { Page, Route } from '@playwright/test';

/**
 * A session whose runtime kagent cannot bring back (giantswarm/backstage#2388).
 *
 * On gazelle a person came back to a session that had waited for their answer
 * overnight; the worker node holding its paused runtime had been reclaimed, and
 * every message failed after 60 s with `actor "ai-…" request timed out` and the
 * same retry. This spec drives the portal through that shape and the one kagent
 * moves to once it marks the instance (`Failure.reason: RUNTIME_LOST`).
 *
 * **kagent's answer is stubbed at the browser**; everything else is real. The
 * session is created through the portal's backend on the lab's kagent, and the
 * new session the page offers is created and opened for real. Only three reads
 * of the *lost* session are answered by this test, in the shapes kagent
 * produces: the turn's event stream (the recorded failure, then the error), the
 * conversation (the failed turn with the runtime's words) and — for the second
 * half — the instance (the `RUNTIME_LOST` failure) and the list row. Losing a
 * runtime for real needs a worker node to go away, which the lab cannot stage
 * on demand; `agentlab`'s Substrate proofs cover that side.
 */

test.describe.configure({ mode: 'serial' });

const prompt = 'Plan a barbecue for twelve; six of them are vegetarian.';
const ATENET = 'actor "ai-e2e-runtime-lost" request timed out';

/** Wire timestamps in kagent's RFC 3339 shape. */
const now = () => new Date().toISOString();

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

/**
 * Stubs of kagent's answers for one session, armed on the page and scoped to
 * the session whose first stream this test sees — every other session (the
 * new one the page opens) goes to the real kagent.
 */
class LostRuntimeStubs {
  /** The lost session's id, learnt from its first stream request. */
  sessionId?: string;
  /** The person's message as sent, echoed into the stubbed conversation. */
  private userMessage?: { messageId: string; text: string };
  /** Whether the instance and list reads carry kagent's mark. */
  reported = false;

  constructor(private readonly page: Page) {}

  private isLostSession(url: URL, tail: string): boolean {
    return (
      this.sessionId !== undefined &&
      url.pathname.endsWith(`/kagent/sessions/${this.sessionId}${tail}`)
    );
  }

  async arm(): Promise<void> {
    // The turn's stream: the submitted task, the failed status kagent records
    // with the runtime's words, then the error the caller receives.
    await this.page.route(
      url => url.pathname.endsWith('/messages/stream'),
      async route => {
        const url = new URL(route.request().url());
        const id = url.pathname.split('/kagent/sessions/')[1]?.split('/')[0];
        if (this.sessionId !== undefined && id !== this.sessionId) {
          await route.fallback();
          return;
        }
        this.sessionId = id;
        const body = route.request().postDataJSON() as {
          messageId: string;
          text: string;
        };
        this.userMessage = { messageId: body.messageId, text: body.text };
        const frames = [
          {
            task: {
              id: 'e2e-task-1',
              contextId: 'e2e-ctx',
              status: { state: 'TASK_STATE_SUBMITTED' },
              history: [this.userWire()],
            },
          },
          {
            statusUpdate: {
              taskId: 'e2e-task-1',
              contextId: 'e2e-ctx',
              status: {
                state: 'TASK_STATE_FAILED',
                timestamp: now(),
                message: {
                  messageId: 'e2e-failure-1',
                  role: 'ROLE_AGENT',
                  parts: [{ text: ATENET }],
                },
              },
            },
          },
          { error: { code: 'Internal', message: ATENET } },
        ];
        await route.fulfill({
          status: 200,
          contentType: 'text/event-stream; charset=utf-8',
          body: frames.map(f => `data: ${JSON.stringify(f)}\n\n`).join(''),
        });
      },
    );

    // The conversation: one turn, failed on the runtime.
    await this.page.route(
      url => url.pathname.endsWith('/tasks'),
      async route => {
        const url = new URL(route.request().url());
        if (!this.isLostSession(url, '/tasks') || !this.userMessage) {
          await route.fallback();
          return;
        }
        await route.fulfill({
          json: {
            tasks: [
              {
                id: 'e2e-task-1',
                contextId: 'e2e-ctx',
                status: {
                  state: 'TASK_STATE_FAILED',
                  timestamp: now(),
                  message: {
                    messageId: 'e2e-failure-1',
                    role: 'ROLE_AGENT',
                    parts: [{ text: ATENET }],
                  },
                },
                history: [this.userWire()],
              },
            ],
            totalSize: 1,
          },
        });
      },
    );

    // The instance, and the list it is a row of: kagent's mark, once armed.
    const markInstance = (instance: Record<string, unknown>) => ({
      ...instance,
      failure: {
        reason: 'RUNTIME_LOST',
        message: `runtime lost: ${ATENET}`,
      },
    });
    await this.page.route(
      url =>
        /\/kagent\/sessions\/[^/]+$/.test(url.pathname) ||
        url.pathname.endsWith('/kagent/sessions'),
      async (route: Route) => {
        const url = new URL(route.request().url());
        if (!this.reported || route.request().method() !== 'GET') {
          await route.fallback();
          return;
        }
        const response = await route.fetch();
        if (!response.ok()) {
          await route.fulfill({ response });
          return;
        }
        const body = (await response.json()) as Record<string, unknown>;
        if (this.isLostSession(url, '')) {
          body.agentInstance = markInstance(
            body.agentInstance as Record<string, unknown>,
          );
        } else if (Array.isArray(body.agentInstances)) {
          body.agentInstances = body.agentInstances.map(instance =>
            (instance as { id?: string }).id === this.sessionId
              ? markInstance(instance as Record<string, unknown>)
              : instance,
          );
        }
        await route.fulfill({ response, json: body });
      },
    );
  }

  private userWire() {
    return {
      messageId: this.userMessage!.messageId,
      role: 'ROLE_USER',
      contextId: 'e2e-ctx',
      taskId: 'e2e-task-1',
      parts: [{ text: this.userMessage!.text }],
    };
  }

  async disarm(): Promise<void> {
    await this.page.unrouteAll({ behavior: 'ignoreErrors' });
  }
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

test('a session whose runtime is lost explains itself, is marked, and opens a new session with the message', async ({
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
  const agentName = (await agents.first().textContent())?.trim() ?? '';
  await agents.first().click();
  await expect(
    admin.getByRole('button', { name: 'Start a session' }),
  ).toBeVisible();

  const stubs = new LostRuntimeStubs(admin);
  await stubs.arm();
  const created: string[] = [];
  let failure: unknown;
  try {
    // --- The session, whose first message runs into the lost runtime ------
    await admin.getByRole('button', { name: 'Start a session' }).click();
    const promptBox = admin.getByRole('textbox', { name: 'Prompt' });
    await expect(promptBox).toBeVisible();
    await promptBox.fill(prompt);
    await admin.getByRole('button', { name: 'Start', exact: true }).click();
    await expect(admin).toHaveURL(
      new RegExp(`/agent-platform/sessions/${lab.installation}/[^/]+$`),
      { timeout: 60_000 },
    );
    const lostUrl = new URL(admin.url());
    created.push(lostUrl.pathname);

    // --- The interim shape: explained, retry kept, the way out beside it --
    // The bubble, not the title: the session's title is derived from the same
    // prompt, so a bare text match finds both.
    const bubble = () =>
      admin.getByTestId('timeline-user-message').filter({ hasText: prompt });
    await expect(
      bubble(),
      "the person's message is on the timeline",
    ).toBeVisible();
    await expect(
      admin.getByText('The agent’s runtime could not be reached'),
      'the failed turn says whose failure it is',
    ).toBeVisible({ timeout: 60_000 });
    await expect(
      admin.getByTestId('timeline-turn-failed'),
      'and what the runtime said, as the evidence',
    ).toContainText(
      `kagent could not bring the agent’s runtime back to answer this message. The runtime said: ${ATENET}`,
    );
    await expect(
      admin.getByText('The agent’s runtime could not be brought back'),
      'the notice explains in the portal’s words',
    ).toBeVisible();
    await expect(
      admin.getByText(/nothing is missing from the transcript/),
    ).toBeVisible();
    await expect(
      admin.getByText(/kagent reported:/),
      'the runtime’s words are the evidence under the explanation',
    ).toContainText(ATENET);
    await expect(
      admin.getByText(ATENET, { exact: true }),
      'and never the whole text of anything',
    ).toHaveCount(0);
    await expect(
      admin.getByRole('button', { name: 'Send' }),
      'the retry stays while the loss is only suspected',
    ).toBeVisible();
    const startNew = admin.getByRole('button', {
      name: `Start a new session with ${agentName}`,
    });
    await expect(startNew, 'the way out stands beside it').toBeEnabled();
    await snapshot(admin, 'runtime-lost-suspected');

    // --- kagent's mark: the header, the composer, the list ----------------
    stubs.reported = true;
    await admin.reload();
    await expect(
      admin.getByText('Runtime lost', { exact: true }).first(),
      'the header carries kagent’s mark',
    ).toBeVisible({ timeout: 60_000 });
    await expect(
      admin.getByText('This session cannot continue', { exact: true }),
    ).toBeVisible();
    await expect(
      admin.getByRole('button', { name: 'Send' }),
      'Send yields to the new session',
    ).toHaveCount(0);
    await expect(startNew).toBeVisible();
    await snapshot(admin, 'runtime-lost-reported');

    await open(admin, '/agent-platform/sessions');
    const lostRow = admin
      .getByRole('row')
      .filter({ has: admin.getByText('Runtime lost', { exact: true }) });
    await expect(
      lostRow.first(),
      'the Sessions list marks the row',
    ).toBeVisible({ timeout: 60_000 });
    await snapshot(admin, 'runtime-lost-sessions-list');

    // --- The way out: a new session with the same agent, message carried --
    await open(admin, lostUrl.pathname);
    await expect(startNew).toBeVisible({ timeout: 60_000 });
    await startNew.click();
    await expect(admin).toHaveURL(
      url =>
        new RegExp(`/agent-platform/sessions/${lab.installation}/[^/]+$`).test(
          url.pathname,
        ) && url.pathname !== lostUrl.pathname,
      { timeout: 60_000 },
    );
    created.push(new URL(admin.url()).pathname);
    await expect(
      bubble(),
      'the message that never got its answer opens the new session',
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      admin.getByText('The agent’s runtime could not be brought back'),
      'a fresh session, with nothing lost about it',
    ).toHaveCount(0);
    await snapshot(admin, 'runtime-lost-new-session');
  } catch (error) {
    failure = error;
  }

  // --- Clean up: both sessions, through the portal ------------------------
  await stubs.disarm();
  for (const path of created.reverse()) {
    try {
      await open(admin, path);
      await deleteCurrentSession(admin);
    } catch (cleanupError) {
      if (failure === undefined) {
        throw cleanupError;
      }
      if (failure instanceof Error) {
        failure.message += `\n\n[cleanup] deleting ${path} through the portal failed too: ${String(cleanupError)}`;
      }
    }
  }
  if (failure !== undefined) {
    throw failure;
  }
});
