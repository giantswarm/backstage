import {
  deleteCurrentSession,
  expect,
  openReadyAgent,
  startSessionButton,
  test,
} from './fixtures';
import { lab } from './lab';
import type { Page } from '@playwright/test';

/**
 * A turn's stream cut mid-turn (giantswarm/giantswarm#38777).
 *
 * A kagent controller rollout ends every stream in flight — the gateway relays
 * `closed pool` and closes — while the turns run on. The page resubscribes to
 * the turn (`…/tasks/:taskId/subscribe`) and continues the live view where it
 * stopped; when that keeps failing, it follows the turn through the poll and
 * says the live view could not be restored.
 *
 * **kagent's answers for one session are stubbed at the browser**; the session
 * itself is created through the portal's backend on the lab's kagent. Answered
 * here: the first message's stream (the snapshot, one message, then the cut),
 * the resubscription, and the conversation (working until the test lets the
 * turn finish). Rolling the lab's controller mid-turn would prove the same
 * thing slower and less reliably, and needs a model that keeps a turn running
 * on demand.
 */

test.describe.configure({ mode: 'serial' });

const prompt = 'How many nodes of the cluster are ready?';
const TASK_ID = 'e2e-resubscribe-task';
const CONTEXT_ID = 'e2e-resubscribe-ctx';
const FIRST = 'Checking the nodes of the cluster.';
const SECOND = 'Seven of the seven nodes are ready.';

const now = () => new Date().toISOString();

/** An agent message as kagent streams and stores it. */
function agentMessage(messageId: string, text: string) {
  return {
    messageId,
    role: 'ROLE_AGENT',
    contextId: CONTEXT_ID,
    taskId: TASK_ID,
    parts: [{ text }],
  };
}

function sse(frames: unknown[]): string {
  return frames.map(f => `data: ${JSON.stringify(f)}\n\n`).join('');
}

/** Stubs of kagent's answers for the session whose first stream this sees. */
class CutStreamStubs {
  sessionId?: string;
  private userMessage?: { messageId: string; text: string };
  /** The second message, once the resubscription has delivered it. */
  private said: ReturnType<typeof agentMessage>[] = [];
  /** The turn is over, and the conversation says so. */
  completed = false;
  /** How many times the page resubscribed. */
  subscriptions = 0;
  /** Holds the resubscription until released, so "Reconnecting…" can be seen. */
  private gate: Promise<void> = Promise.resolve();
  private release: () => void = () => {};

  constructor(
    private readonly page: Page,
    /** Whether a resubscription opens, or fails as a rolling controller does. */
    private readonly resubscribes: boolean,
  ) {}

  hold(): void {
    this.gate = new Promise(resolve => (this.release = resolve));
  }

  open(): void {
    this.release();
  }

  private userWire() {
    return {
      messageId: this.userMessage!.messageId,
      role: 'ROLE_USER',
      contextId: CONTEXT_ID,
      taskId: TASK_ID,
      parts: [{ text: this.userMessage!.text }],
    };
  }

  private task(state: string) {
    return {
      id: TASK_ID,
      contextId: CONTEXT_ID,
      status: { state, timestamp: now() },
      history: [this.userWire(), ...this.said],
    };
  }

  async arm(): Promise<void> {
    // The first stream: the snapshot, the first message, then the cut.
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
        this.said = [agentMessage('e2e-said-1', FIRST)];
        await route.fulfill({
          status: 200,
          contentType: 'text/event-stream; charset=utf-8',
          body: sse([
            { task: this.task('TASK_STATE_WORKING') },
            {
              statusUpdate: {
                taskId: TASK_ID,
                contextId: CONTEXT_ID,
                status: {
                  state: 'TASK_STATE_WORKING',
                  timestamp: now(),
                  message: agentMessage('e2e-said-1', FIRST),
                },
              },
            },
            {
              error: {
                code: 'Canceled',
                message: 'Failed to get Session: closed pool',
              },
            },
          ]),
        });
      },
    );

    // The resubscription: the snapshot and the second message, then the end
    // of the turn — or, for a controller that is not back, its refusal.
    await this.page.route(
      url => url.pathname.endsWith(`/tasks/${TASK_ID}/subscribe`),
      async route => {
        this.subscriptions += 1;
        await this.gate;
        if (!this.resubscribes) {
          await route.fulfill({
            status: 200,
            contentType: 'text/event-stream; charset=utf-8',
            body: sse([
              {
                error: { code: 'Unavailable', message: 'no healthy upstream' },
              },
            ]),
          });
          return;
        }
        this.said = [...this.said, agentMessage('e2e-said-2', SECOND)];
        this.completed = true;
        await route.fulfill({
          status: 200,
          contentType: 'text/event-stream; charset=utf-8',
          body: sse([
            { task: this.task('TASK_STATE_WORKING') },
            {
              statusUpdate: {
                taskId: TASK_ID,
                contextId: CONTEXT_ID,
                status: {
                  state: 'TASK_STATE_COMPLETED',
                  timestamp: now(),
                  message: agentMessage('e2e-said-2', SECOND),
                },
              },
            },
          ]),
        });
      },
    );

    // The conversation: the turn as far as it got.
    await this.page.route(
      url => url.pathname.endsWith('/tasks'),
      async route => {
        const url = new URL(route.request().url());
        if (
          this.sessionId === undefined ||
          !url.pathname.endsWith(`/kagent/sessions/${this.sessionId}/tasks`) ||
          !this.userMessage
        ) {
          await route.fallback();
          return;
        }
        await route.fulfill({
          json: {
            tasks: [
              this.task(
                this.completed ? 'TASK_STATE_COMPLETED' : 'TASK_STATE_WORKING',
              ),
            ],
            totalSize: 1,
          },
        });
      },
    );
  }

  /** Let the turn finish: the conversation now holds the reply. */
  finish(): void {
    this.said = [...this.said, agentMessage('e2e-said-2', SECOND)];
    this.completed = true;
  }

  async disarm(): Promise<void> {
    this.open();
    await this.page.unrouteAll({ behavior: 'ignoreErrors' });
  }
}

/** Start a session with `prompt` and wait for its page. */
async function startSession(page: Page): Promise<string> {
  await startSessionButton(page).click();
  const promptBox = page.getByRole('textbox', { name: 'Prompt' });
  await expect(promptBox).toBeVisible();
  await promptBox.fill(prompt);
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page).toHaveURL(
    new RegExp(`/sessions/${lab.installation}/[^/]+$`),
    { timeout: 60_000 },
  );
  return new URL(page.url()).pathname;
}

/** Run `body` on a fresh session, then delete it through the portal. */
async function withSession(
  page: Page,
  stubs: CutStreamStubs,
  body: () => Promise<void>,
): Promise<void> {
  await stubs.arm();
  let failure: unknown;
  let created = false;
  try {
    await startSession(page);
    created = true;
    await body();
  } catch (error) {
    failure = error;
  }
  await stubs.disarm();
  if (created) {
    try {
      await deleteCurrentSession(page);
    } catch (cleanupError) {
      if (failure === undefined) {
        throw cleanupError;
      }
    }
  }
  if (failure !== undefined) {
    throw failure;
  }
}

test('a stream cut mid-turn is picked up again, and the reply continues where it stopped', async ({
  admin,
  labAgent,
}) => {
  test.setTimeout(5 * 60_000);
  await openReadyAgent(admin, labAgent);
  const stubs = new CutStreamStubs(admin, true);
  stubs.hold();

  await withSession(admin, stubs, async () => {
    await expect(
      admin.getByText('The live view was interrupted. Reconnecting…'),
      'the cut is said while the page resubscribes',
    ).toBeVisible({ timeout: 60_000 });
    await expect(
      admin.getByText(FIRST),
      'what was streamed so far stays',
    ).toHaveCount(1);
    await expect(
      admin.getByText(/Could not restore the live view/),
    ).toHaveCount(0);

    // At the narrowest phone the shell supports, the row wraps in the page.
    await admin.setViewportSize({ width: 375, height: 812 });
    expect(
      await admin.evaluate(() => document.documentElement.scrollWidth),
      'no sideways scroll',
    ).toBeLessThanOrEqual(375);
    await admin.setViewportSize({ width: 1440, height: 900 });

    stubs.open();

    await expect(
      admin.getByText(SECOND),
      'the reply continues through the resubscription',
    ).toBeVisible({ timeout: 30_000 });
    await expect(admin.getByText(FIRST), 'nothing shows twice').toHaveCount(1);
    await expect(admin.getByText(SECOND)).toHaveCount(1);
    await expect(
      admin.getByText('The live view was interrupted. Reconnecting…'),
    ).toHaveCount(0);
    await expect(admin.getByText(/live stream was lost/)).toHaveCount(0);
    expect(stubs.subscriptions).toBe(1);
  });
});

test('a stream that cannot be picked up again falls back to the poll, says so, and the result arrives', async ({
  admin,
  labAgent,
}) => {
  test.setTimeout(5 * 60_000);
  await openReadyAgent(admin, labAgent);
  const stubs = new CutStreamStubs(admin, false);

  await withSession(admin, stubs, async () => {
    // Four tries over 7 s, then the poll takes over.
    await expect(
      admin.getByText(/Could not restore the live view\./),
      'the page says the live view could not be restored',
    ).toBeVisible({ timeout: 60_000 });
    expect(stubs.subscriptions).toBe(4);
    await expect(admin.getByText(FIRST)).toHaveCount(1);

    stubs.finish();

    await expect(
      admin.getByText(SECOND),
      'the result arrives through the poll',
    ).toBeVisible({ timeout: 60_000 });
    await expect(
      admin.getByText(/Could not restore the live view/),
    ).toHaveCount(0);
  });
});
