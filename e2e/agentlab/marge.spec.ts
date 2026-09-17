import { expect, open, test } from './fixtures';

/**
 * The marge tab: a team's queue as marge classifies it, read and swept
 * through marge's MCP tools over muster as the signed-in person. The lab runs
 * marge behind a GitHub OAuth chain, so what a lab user sees depends on
 * whether their muster session holds a GitHub grant: without one the page
 * guides them to marge's per-server Sign in, with one it lists the queue and
 * offers the sweep preview. The suite cannot complete a GitHub consent with a
 * fixture account, so it proves both landings and the controls around them.
 */

test('the tab lands on a team and offers the selector and the group toggle', async ({
  admin,
}) => {
  await open(admin, '/agent-platform/marge');
  // The index redirects to a team: the person's own when the catalogue knows
  // one, else the first team it lists, else the `-` placeholder.
  await expect(admin).toHaveURL(/\/agent-platform\/marge\/[^/?]+/);
  await expect(admin.getByRole('button', { name: 'Team' })).toBeVisible();
  await expect(admin.getByRole('textbox', { name: 'Any team' })).toBeVisible();
  await expect(admin.getByText('Group by dependency')).toBeVisible();
});

test('a typed team lands in the URL', async ({ admin }) => {
  await open(admin, '/agent-platform/marge/-');
  const field = admin.getByRole('textbox', { name: 'Any team' });
  await field.fill('bumblebee');
  await field.press('Enter');
  await expect(admin).toHaveURL(/\/agent-platform\/marge\/bumblebee$/);
});

test('a person without a GitHub grant is guided to sign in, one with a grant sees the queue', async ({
  admin,
}) => {
  await open(admin, '/agent-platform/marge/bumblebee');
  const signIn = admin.getByText('Sign in to GitHub for marge');
  const preview = admin.getByRole('button', { name: 'Preview sweep' });
  await expect(
    signIn.or(preview).first(),
    'the page either offers the per-server sign-in or the queue with its controls',
  ).toBeVisible({ timeout: 120_000 });

  if (await signIn.isVisible()) {
    // The muster plugin's own affordance, reused rather than rebuilt: it asks
    // muster for the GitHub challenge and opens it in a popup.
    await expect(admin.getByRole('button', { name: 'Sign in' })).toBeVisible();
    await expect(preview).toBeDisabled();
    return;
  }

  // The queue: the read is the stored classification, said so in words, and
  // the live classification is a button, never automatic.
  await expect(admin.getByText(/open bot PRs? for team bumblebee/)).toBeVisible(
    { timeout: 120_000 },
  );
  await expect(
    admin.getByRole('button', { name: 'Refresh classification' }),
  ).toBeEnabled();
  await expect(preview).toBeEnabled();
});
