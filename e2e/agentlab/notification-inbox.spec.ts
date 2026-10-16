import { expect, open, test } from './fixtures';
import { NOTIFICATIONS, stubNotifications } from './notifications';

/**
 * The Notification inbox's rows from the upstream notifications store: what
 * other portal features send the person shows in the bell's overlay as a
 * plain row (title, description, age), next to the session rows, and opening
 * one follows its link and marks it read in the store. The store's answers
 * are staged at the browser (`notifications.ts`); the shell is the lab's.
 */

test.afterEach(async ({ admin }) => {
  await admin.unroute(NOTIFICATIONS);
});

test('a notification another feature sent is a plain row in the overlay, opened and marked read from it', async ({
  admin,
}) => {
  const { marked } = await stubNotifications(admin, [
    {
      id: 'e2e-plain-1',
      title: 'E2E template run finished',
      description: 'Create a Go service',
      link: '/usage',
    },
    {
      id: 'e2e-plain-2',
      title: 'E2E older notification',
      read: true,
    },
  ]);
  await open(admin, '/sessions');

  await admin
    .getByRole('button', { name: /^Notifications, \d+ unread$/ })
    .click();
  const overlay = admin.getByRole('dialog', { name: 'Notifications' });
  const row = overlay.getByRole('link', {
    name: 'Unread: E2E template run finished',
  });
  await expect(row).toBeVisible();
  await expect(row).toContainText(/Create a Go service\s·\s5 minutes ago/);
  // A read one stays in the list, not bold, with no unread mark.
  await expect(
    overlay.getByRole('link', { name: /^E2E older notification/ }),
  ).toBeVisible();

  await row.click();
  await expect(admin).toHaveURL(/\/usage$/);
  await expect.poll(() => marked).toEqual([['e2e-plain-1']]);
  // Read now: the overlay, opened again, says so.
  await admin.getByRole('button', { name: /^Notifications/ }).click();
  await expect(
    overlay.getByRole('link', { name: /^E2E template run finished/ }),
  ).not.toHaveAccessibleName(/^Unread/);
});
