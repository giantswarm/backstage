import { execFileSync } from 'node:child_process';

import { expect, open, test } from './fixtures';

/**
 * A template registered from a branch whose name contains a slash
 * (giantswarm/backstage#2774): `blob/feat/x/…` is ambiguous, and the backend's
 * GitHub URL reader used to take `feat` for the branch and fail with not found.
 *
 * The template is the suite's fixture `templates/slash-branch/template.yaml`,
 * read from the checkout's own branch on GitHub — every pull request branch
 * here is named `feat/…` or `fix/…`, and must be pushed. It fetches its
 * `./skeleton` (a tree read on the same branch) and logs; nothing outside the
 * task is touched. `AGENTLAB_SLASH_BRANCH` names another pushed branch.
 */
const branch =
  process.env.AGENTLAB_SLASH_BRANCH ??
  execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
const TEMPLATE = 'e2e-slash-branch';
const TEMPLATE_URL = `https://github.com/giantswarm/backstage/blob/${branch}/e2e/agentlab/templates/slash-branch/template.yaml`;

test.describe('a template on a branch with a slash', () => {
  test.skip(
    !branch.includes('/'),
    `the checkout's branch "${branch}" has no slash: set AGENTLAB_SLASH_BRANCH to a pushed branch that has one`,
  );

  test('registers and runs, its skeleton fetched from the branch', async ({
    admin,
  }) => {
    await open(admin, '/catalog-import');
    await admin.getByRole('textbox', { name: /URL/ }).fill(TEMPLATE_URL);
    await admin.getByRole('button', { name: 'Analyze' }).click();
    // A location the lab registered in an earlier run offers Refresh.
    const register = admin.getByRole('button', { name: /^(Import|Refresh)$/ });
    await expect(register).toBeVisible({ timeout: 30_000 });
    await expect(admin.getByText(`template:default/${TEMPLATE}`)).toBeVisible();
    await register.click();
    await expect(
      admin.getByRole('button', { name: 'Register another' }),
    ).toBeVisible({ timeout: 30_000 });

    const message = `slash branch ${Date.now()}`;
    await open(admin, `/create/templates/default/${TEMPLATE}`);
    await admin.getByRole('textbox', { name: 'Message' }).fill(message);
    await admin.getByRole('button', { name: 'Review' }).click();
    await admin.getByRole('button', { name: 'Create' }).click();

    await expect(admin).toHaveURL(/\/create\/tasks\//);
    await expect(admin.getByText(message).first()).toBeVisible({
      timeout: 60_000,
    });
    await admin.getByRole('button', { name: /Show Logs/i }).click();
    await expect(
      admin.getByText('slash-branch-skeleton.txt').first(),
      'the skeleton was fetched from the branch',
    ).toBeVisible();
  });
});
