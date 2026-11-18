import {
  deleteCurrentSession,
  expect,
  open,
  openReadyAgent,
  startSessionButton,
  test,
} from './fixtures';
import { lab } from './lab';
import type { Page } from '@playwright/test';

/**
 * An approval for a muster tool names that tool (giantswarm/giantswarm#39222).
 *
 * Agents call muster tools through `call_tool`, so the runtime's approval
 * request names `call_tool`, with the real tool and its arguments inside. The
 * session's approval row and the answer card name the real tool and show its
 * own arguments, and the runtime's hint ("…responding with a FunctionResponse…"),
 * which kagent also sends as the message's text, is not shown as the agent's
 * prose.
 *
 * **kagent's answer is stubbed at the browser**: an approval needs an agent
 * with `muster.requireApproval` whose model calls a tool on demand. The
 * session is created through the portal's backend on the lab's kagent; only
 * the turn's stream and the conversation are answered by this test, in the v1
 * shapes kagent produces (`tasks.hitl-approval.kagent-4a91c273.json`).
 */

test.describe.configure({ mode: 'serial' });

const prompt = 'Roll back the last release tonight.';
const TOOL = 'x_e2e-site-control_schedule_rollback';
const ARGUMENTS = { release: 'v1.2.3', window: 'tonight' };
const HINT =
  'Please approve or reject the tool call call_tool() by responding with a FunctionResponse with an expected ToolConfirmation payload.';
const HITL = 'https://kagent.dev/extensions/hitl/v1';

const now = () => new Date().toISOString();

/** The suspended turn, as kagent records it. */
function suspendedTask(user: { messageId: string; text: string }) {
  return {
    id: 'e2e-task-1',
    contextId: 'e2e-ctx',
    status: {
      state: 'TASK_STATE_INPUT_REQUIRED',
      timestamp: now(),
      message: {
        messageId: 'e2e-approval-1',
        contextId: 'e2e-ctx',
        taskId: 'e2e-task-1',
        role: 'ROLE_AGENT',
        parts: [{ text: HINT }],
        metadata: {
          [HITL]: {
            hint: HINT,
            tools: [
              {
                name: 'call_tool',
                args: { name: TOOL, arguments: ARGUMENTS },
                id: 'adk-e2e-1',
                call_id: 'call-e2e-1',
              },
            ],
            type: 'tool_approval_request',
          },
        },
        extensions: [HITL],
      },
    },
    history: [
      {
        messageId: user.messageId,
        role: 'ROLE_USER',
        contextId: 'e2e-ctx',
        taskId: 'e2e-task-1',
        parts: [{ text: user.text }],
      },
    ],
  };
}

/** Stubs of kagent's answers for the session whose first stream this sees. */
async function armStubs(page: Page): Promise<void> {
  let sessionId: string | undefined;
  let user: { messageId: string; text: string } | undefined;

  await page.route(
    url => url.pathname.endsWith('/messages/stream'),
    async route => {
      const url = new URL(route.request().url());
      const id = url.pathname.split('/kagent/sessions/')[1]?.split('/')[0];
      if (sessionId !== undefined && id !== sessionId) {
        await route.fallback();
        return;
      }
      sessionId = id;
      user = route.request().postDataJSON() as {
        messageId: string;
        text: string;
      };
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream; charset=utf-8',
        body: `data: ${JSON.stringify({ task: suspendedTask(user) })}\n\n`,
      });
    },
  );

  await page.route(
    url => url.pathname.endsWith('/tasks'),
    async route => {
      const url = new URL(route.request().url());
      if (
        sessionId === undefined ||
        !user ||
        !url.pathname.endsWith(`/kagent/sessions/${sessionId}/tasks`)
      ) {
        await route.fallback();
        return;
      }
      await route.fulfill({
        json: { tasks: [suspendedTask(user)], totalSize: 1 },
      });
    },
  );
}

test('an approval for a muster tool names the tool and its arguments, not call_tool or the runtime’s hint', async ({
  admin,
  labAgent,
}) => {
  test.setTimeout(5 * 60_000);
  await openReadyAgent(admin, labAgent);
  await armStubs(admin);

  let sessionPath: string | undefined;
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
    sessionPath = new URL(admin.url()).pathname;

    const row = admin.getByRole('button', { name: /Approval requested/ });
    await expect(row, 'the approval is on the timeline').toBeVisible({
      timeout: 60_000,
    });
    await expect(row, 'it names the muster tool').toContainText(
      'X e2e site control schedule rollback',
    );
    await expect(row, 'and that it goes through muster').toContainText(
      'via Muster',
    );
    await expect(row, 'not the proxy').not.toContainText('Call tool');

    await row.click();
    const detail = admin.getByText(TOOL, { exact: true });
    await expect(detail, 'the fold-out has the exact tool').toBeVisible();
    await expect(
      admin.getByText(/"window": "tonight"/).first(),
      'and its own arguments',
    ).toBeVisible();

    await expect(
      admin.getByText(/FunctionResponse/),
      'the runtime’s hint is not the agent’s prose',
    ).toHaveCount(0);

    const card = admin.getByTestId('hitl-card');
    await expect(card, 'the answer card names the tool too').toContainText(
      'X e2e site control schedule rollback',
    );
    await expect(card).toContainText('v1.2.3');
  } catch (error) {
    failure = error;
  }

  await admin.unrouteAll({ behavior: 'ignoreErrors' });
  if (sessionPath) {
    try {
      await open(admin, sessionPath);
      await deleteCurrentSession(admin);
    } catch (cleanupError) {
      if (failure === undefined) {
        throw cleanupError;
      }
    }
  }
  if (failure !== undefined) {
    throw failure;
  }
});
