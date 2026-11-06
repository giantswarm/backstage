import {
  deleteCurrentSession,
  expect,
  openReadyAgent,
  startSessionButton,
  test,
} from './fixtures';
import { lab } from './lab';

/**
 * The session page's Notifications submenu: three levels, each labelled by
 * when it notifies, the current one ticked, and the choice kept across a
 * reload. The session is started in the portal, so every level is offered.
 */

const prompt = 'Say hello in one word.';

test('a session’s notification level is chosen from its actions menu and kept across a reload', async ({
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

  const openNotifications = async () => {
    await admin.getByRole('button', { name: 'Session actions' }).click();
    await admin.getByRole('menuitem', { name: 'Notifications' }).click();
    const submenu = admin.getByRole('menu', { name: 'Notifications' });
    await expect(submenu).toBeVisible();
    return submenu;
  };
  const level = (name: string) =>
    admin.getByRole('menuitemradio', { name, exact: true });

  try {
    const submenu = await openNotifications();
    await expect(submenu.getByRole('menuitemradio')).toHaveText([
      'When action is required',
      'When action is required or a turn finishes',
      'Muted',
    ]);
    await expect(level('When action is required')).toHaveAttribute(
      'aria-checked',
      'true',
    );

    await level('When action is required or a turn finishes').click();
    await expect(submenu).toBeHidden();

    await admin.reload();
    await openNotifications();
    await expect(
      level('When action is required or a turn finishes'),
    ).toHaveAttribute('aria-checked', 'true');
    await expect(level('When action is required')).toHaveAttribute(
      'aria-checked',
      'false',
    );
  } finally {
    await admin.keyboard.press('Escape');
    await admin.keyboard.press('Escape');
    await deleteCurrentSession(admin);
  }
});
