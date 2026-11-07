import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { expect, open, openReadyAgent, test } from './fixtures';
import { lab } from './lab';

const run = promisify(execFile);
const labName = process.env.AGENTLAB_CLUSTER ?? 'agentlab';

/**
 * Real shared turns through the lab's authenticated A2A edge, then the portal's
 * persisted conversation. No task responses or identities are stubbed.
 */
test('a shared conversation names each sender after reload', async ({
  admin,
  labAgent,
}) => {
  test.setTimeout(8 * 60_000);
  await openReadyAgent(admin, labAgent);
  const common = [
    'turn',
    '--lab',
    labName,
    '--user',
    lab.users.admin.email,
    '--template',
    labAgent.slug,
  ];
  const originalViewport = admin.viewportSize();
  let sessionId: string | undefined;
  try {
    const first = await run('agentlab', [
      ...common,
      '--keep',
      'Remember the word orchard and reply briefly.',
    ]);
    sessionId = first.stdout.match(/^session: ([0-9a-f-]{36}) /m)?.[1];
    expect(sessionId, 'the first turn creates a kept Session').toBeTruthy();

    const second = await run('agentlab', [
      ...common,
      '--session',
      sessionId!,
      '--share-with',
      lab.users.dev.email,
      'What word did the first person ask you to remember? Reply briefly.',
    ]);
    expect(
      second.stdout,
      'the visitor continues the same conversation',
    ).toMatch(/orchard/i);

    await open(admin, `/sessions/${lab.installation}/${sessionId}`);
    const senders = admin.getByTestId('timeline-user-message-sender');
    await expect(senders).toHaveText(
      [lab.users.admin.email, lab.users.dev.email],
      { timeout: 60_000 },
    );
    await admin.reload();
    await expect(senders).toHaveText([
      lab.users.admin.email,
      lab.users.dev.email,
    ]);
    await admin.setViewportSize({ width: 375, height: 812 });
    await expect(senders).toHaveText([
      lab.users.admin.email,
      lab.users.dev.email,
    ]);
    expect(
      await admin.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
      'sender labels do not cause horizontal scrolling',
    ).toBe(false);
  } finally {
    if (originalViewport) {
      await admin.setViewportSize(originalViewport);
    }
    if (sessionId) {
      await run('agentlab', [
        'turn',
        '--lab',
        labName,
        '--user',
        lab.users.admin.email,
        '--session',
        sessionId,
        '--delete',
      ]);
    }
  }
});
