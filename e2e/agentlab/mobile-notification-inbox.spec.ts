import { expect, expectNoHorizontalScroll, open, test } from './fixtures';
import { NOTIFICATIONS, stubNotifications } from './notifications';

/**
 * The Notification inbox on a phone (375×812; the `agentlab-mobile` project):
 * the Profile menu's "Notifications" entry opens the overlay as a full-width
 * sheet, and a plain row from the upstream notifications store fits it, its
 * long description cut short so its age still shows. The store's answers are
 * staged at the browser (`notifications.ts`).
 */

test.afterEach(async ({ admin }) => {
  await admin.unroute(NOTIFICATIONS);
});

test('the Profile menu opens the inbox as a sheet, a plain row fitting it', async ({
  admin,
}) => {
  await stubNotifications(admin, [
    {
      id: 'e2e-plain-phone',
      title: 'E2E repository approval needed',
      description:
        'The team file change awaits your Lifecycle approval. Open the pull request to review the ownership transfer and approve or reject it.',
      link: 'https://github.com/giantswarm/backstage/pulls',
    },
  ]);
  await open(admin, '/sessions');

  await admin
    .getByRole('navigation', { name: 'Main', exact: true })
    .getByRole('button', { name: 'Profile and settings' })
    .click();
  await admin
    .getByRole('menu')
    .getByRole('menuitem', { name: /^Notifications \(\d+\)$/ })
    .click();
  const sheet = admin.getByRole('dialog', { name: 'Notifications' });
  const row = sheet.getByRole('link', {
    name: 'Unread: E2E repository approval needed',
  });
  await expect(row).toBeVisible();
  // Out of the portal: a new tab, never this one.
  await expect(row).toHaveAttribute('target', '_blank');
  await expect(row).toContainText('5 minutes ago');
  const box = await row.boundingBox();
  expect(box!.x + box!.width).toBeLessThanOrEqual(375);
  await expectNoHorizontalScroll(admin, 'the notification sheet');
});
