import { expect, open, test } from './fixtures';
import { lab } from './lab';

const sessionId = 'e2e-model-failure';
const credentialsMessage =
  'The agent could not access its model. Ask your platform team to check the model’s credentials and permissions.';
const retryMessage =
  'Try again, or ask your platform team for help if this continues.';

for (const { status, message } of [
  { status: '401 Unauthorized', message: credentialsMessage },
  { status: '403 Forbidden', message: credentialsMessage },
  { status: '404 Not Found', message: retryMessage },
  { status: '429 Too Many Requests', message: retryMessage },
  { status: '529 Overloaded', message: retryMessage },
]) {
  test(`a ${status} model failure explains recovery and folds the raw error`, async ({
    admin,
  }) => {
    const reason = `llm error response (code STREAM_ERROR): ${JSON.stringify(
      `POST "http://model-gateway.svc/v1/messages": ${status} {"error":{"message":"Provider refused the request"}}`,
    )}`;
    const timestamp = new Date().toISOString();
    await admin.route(
      url => url.pathname.endsWith(`/kagent/sessions/${sessionId}`),
      route =>
        route.fulfill({
          json: {
            session: {
              id: sessionId,
              creator: lab.users.admin.email,
              name: 'Model failure',
              agent: { namespace: 'kagent', name: 'e2e-model-failure' },
              state: 'RUNTIME_STATE_READY',
              contextId: sessionId,
              createdAt: timestamp,
              updatedAt: timestamp,
            },
          },
        }),
    );
    await admin.route(
      url => url.pathname.endsWith(`/kagent/sessions/${sessionId}/tasks`),
      route =>
        route.fulfill({
          json: {
            tasks: [
              {
                id: 'model-failure-turn',
                contextId: sessionId,
                status: {
                  state: 'TASK_STATE_FAILED',
                  timestamp,
                  message: {
                    messageId: 'model-failure-message',
                    role: 'ROLE_AGENT',
                    parts: [{ text: reason }],
                  },
                },
                history: [
                  {
                    messageId: 'model-failure-prompt',
                    role: 'ROLE_USER',
                    parts: [{ text: 'Say hello.' }],
                  },
                ],
              },
            ],
            totalSize: 1,
          },
        }),
    );

    await open(admin, `/sessions/${lab.installation}/${sessionId}`);
    const failure = admin.getByTestId('timeline-turn-failed');
    await expect(
      failure.getByText('Could not get an answer from the model', {
        exact: true,
      }),
    ).toBeVisible();
    await expect(failure.getByText(message, { exact: true })).toBeVisible();
    await expect(failure.getByText(reason, { exact: true })).toHaveCount(0);

    const details = failure.getByRole('button', {
      name: 'Technical details',
      exact: true,
    });
    await details.focus();
    await admin.keyboard.press('Enter');
    await expect(failure.getByText(reason, { exact: true })).toBeVisible();
    expect(
      await admin.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await admin.keyboard.press('Enter');
    await expect(failure.getByText(reason, { exact: true })).toHaveCount(0);
  });
}
