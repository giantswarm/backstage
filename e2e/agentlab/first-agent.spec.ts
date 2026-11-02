import { expect, expectWizardStep, open, test } from './fixtures';

/**
 * The first-run state of a lab without agents: Customize's Agents tab and
 * Home each show a "No agents yet" card that links to the same create form as
 * Customize's New agent button.
 *
 * Only a lab that holds no agent shows the card, so the test skips on one that
 * does (another spec's fixture agent, a worker's own). Customize's Agents tab
 * says which it is: its own "No agents yet" state, or the roster's rows.
 */
test('the first-agent invitation opens the New agent wizard', async ({
  admin,
}) => {
  await open(admin, '/customize/agents');
  const noAgents = admin.getByRole('heading', { name: 'No agents yet' });
  const roster = admin
    .getByRole('main')
    .getByRole('listitem')
    .getByRole('link')
    .first();
  await expect(noAgents.or(roster).first()).toBeVisible({ timeout: 60_000 });
  test.skip(await roster.isVisible(), 'the lab holds agents: no invitation');
  await expect(
    admin.getByRole('link', { name: 'Create your first agent', exact: true }),
  ).toHaveAttribute('href', '/customize/agents/new');

  await open(admin, '/');
  await admin.getByRole('link', { name: 'Create your first agent' }).click();

  await expect(admin).toHaveURL(/\/customize\/agents\/new$/);
  await expectWizardStep(admin, 'Details');
  await expect(
    admin.getByRole('textbox', { name: 'Name', exact: true }),
  ).toBeVisible();
});
