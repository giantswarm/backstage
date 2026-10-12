import { expect, open, test } from './fixtures';

/**
 * The first-run state of a lab without agents: the "No agents yet" card's call
 * to action opens the same create form as the header's New agent button.
 *
 * Only a lab that holds no agent shows the card, so the test skips on one that
 * does (another spec's fixture agent, a worker's own).
 */
test('the first-agent invitation opens the New agent wizard', async ({
  admin,
}) => {
  await open(admin, '/agent-platform/agents');
  const invitation = admin.getByRole('heading', { name: 'No agents yet' });
  const roster = admin.getByRole('grid', { name: 'Data table' });
  await expect(invitation.or(roster).first()).toBeVisible({ timeout: 60_000 });
  test.skip(await roster.isVisible(), 'the lab holds agents: no invitation');

  await admin.getByRole('link', { name: 'Create your first agent' }).click();

  await expect(admin).toHaveURL(/\/agent-platform\/agents\/new$/);
  await expect(
    admin.getByRole('textbox', { name: /Name/ }).first(),
  ).toBeVisible();
});
