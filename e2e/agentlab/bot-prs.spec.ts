import { expect, open, test } from './fixtures';

/**
 * The Bot PRs page: the open bot PRs of the person's teams, or of every team,
 * as marge classifies them, read and swept through marge's MCP tools over
 * muster as the signed-in person. The lab runs marge behind a GitHub OAuth
 * chain, so what a lab user sees depends on whether their muster session
 * holds a GitHub grant: without one the page guides them to marge's
 * per-server Sign in, with one it lists the queue. The suite cannot complete
 * a GitHub consent with a fixture account, so it proves both landings.
 *
 * The lab's catalogue groups are Dex fixtures without the `team-` prefix, so
 * the page names no team of its own there; `?team=` on All teams is how the
 * suite reaches a real queue.
 */

test('the page offers the two scopes and lands on All teams for a lab user', async ({
  admin,
}) => {
  await open(admin, '/bot-prs');
  await expect(admin.getByRole('tab', { name: 'My team' })).toBeVisible();
  await expect(admin.getByRole('tab', { name: 'All teams' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(
    admin.getByText(/The catalog lists no team/),
  ).toBeVisible();
});

test('a person without a GitHub grant is guided to sign in, one with a grant sees the queue', async ({
  admin,
}) => {
  await open(admin, '/bot-prs?scope=all&team=bumblebee');
  const signIn = admin.getByText('Sign in to GitHub for marge');
  const summary = admin.getByTestId('queue-summary');
  await expect(
    signIn.or(summary).first(),
    'the page either offers the per-server sign-in or the queue',
  ).toBeVisible({ timeout: 120_000 });

  if (await signIn.isVisible()) {
    // The muster plugin's own affordance, reused rather than rebuilt: it asks
    // muster for the GitHub challenge and opens it in a popup.
    await expect(admin.getByRole('button', { name: 'Sign in' })).toBeVisible();
    await expect(
      admin.getByRole('button', { name: 'Preview sweep' }),
    ).toBeDisabled();
    return;
  }

  // The queue: the stored classification, said so in words; the live
  // classification and the sweep preview are buttons, never automatic.
  await expect(summary).toContainText(/open bot PRs?.* across 1 team/);
  await expect(
    admin.getByRole('button', { name: 'Refresh classification' }),
  ).toBeEnabled();
  await expect(
    admin.getByRole('button', { name: 'Preview sweep' }),
  ).toBeEnabled();
  await expect(admin.getByRole('table', { name: 'Bot PRs' })).toBeVisible();
  await expect(admin.getByTestId('tile-classification')).toBeVisible();
});
