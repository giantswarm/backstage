import { readFile } from 'node:fs/promises';
import {
  deleteCurrentSession,
  expect,
  openReadyAgent,
  startSessionButton,
  test,
} from './fixtures';
import { lab } from './lab';

/**
 * Export session (giantswarm/giantswarm#38577): the session page's actions
 * menu saves the session and its tasks as one JSON file, the session and the
 * tasks verbatim from the portal's session routes, inside a five-key envelope.
 *
 * Everything is real: the session is started on the lab's kagent and exported
 * while its first turn may still run, which the export allows.
 */

const prompt = 'Say hello in one word.';

test('a session exports to a file from its actions menu, whole and verbatim', async ({
  admin,
  labAgent,
}) => {
  test.setTimeout(5 * 60_000);

  await openReadyAgent(admin, labAgent);
  await startSessionButton(admin).click();
  const promptBox = admin.getByRole('textbox', { name: 'Prompt' });
  await expect(promptBox).toBeVisible();
  await promptBox.fill(prompt);
  await admin.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(admin).toHaveURL(
    new RegExp(`/sessions/${lab.installation}/[^/]+$`),
    { timeout: 60_000 },
  );
  const sessionId = decodeURIComponent(
    new URL(admin.url()).pathname.split('/').pop()!,
  );

  try {
    // The person's message is read from the session's tasks: once it shows,
    // the export has a task to save.
    await expect(
      admin.getByTestId('timeline-user-message').filter({ hasText: prompt }),
    ).toBeVisible({ timeout: 60_000 });

    await admin.getByRole('button', { name: 'Session actions' }).click();
    const item = admin.getByRole('menuitem', {
      name: 'Export session',
      exact: true,
    });
    await expect(item, 'it is an export, never a download').not.toContainText(
      /download/i,
    );

    const download = admin.waitForEvent('download');
    await item.click();
    const file = await download;
    await expect(admin.getByText('Session exported')).toBeVisible();

    expect(file.suggestedFilename()).toMatch(/-session-[A-Za-z0-9_-]+\.json$/);
    const saved = JSON.parse(await readFile((await file.path())!, 'utf8'));
    expect(Object.keys(saved)).toEqual([
      'formatVersion',
      'exportedAt',
      'installation',
      'session',
      'tasks',
    ]);
    expect(saved.formatVersion).toBe(1);
    expect(saved.installation).toBe(lab.installation);
    expect(saved.session.id).toBe(sessionId);
    expect(saved.tasks.length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(saved.tasks[0])).toContain(prompt);
  } finally {
    await admin.keyboard.press('Escape');
    await deleteCurrentSession(admin);
  }
});
