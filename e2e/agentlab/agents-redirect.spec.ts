import { expect, expectWizardStep, open, test } from './fixtures';

/**
 * The short `/agents` path people, links and docs use lands on the Agents
 * list — `/agent-platform/agents`, which the shell shows as Customize's Agents
 * tab — and a path below it on the same place under the tab, instead of a
 * not-found page.
 */

test('/agents lands on the Agents list', async ({ admin }) => {
  await open(admin, '/agents');
  await expect(admin).toHaveURL(/\/customize\/agents$/);
  // The roster or its "No agents yet" state, depending on what the lab runs:
  // either way the Agents tab is the selected one.
  await expect(
    admin.getByRole('main').getByRole('tab', { name: /^Agents/ }),
  ).toHaveAttribute('aria-selected', 'true');
  await expect(
    admin.getByRole('link', { name: 'New agent', exact: true }),
  ).toBeVisible();
});

test('/agents/new lands on the create form, query kept', async ({ admin }) => {
  await open(admin, '/agents/new?from=e2e');
  await expect(admin).toHaveURL(/\/agent-platform\/agents\/new\?from=e2e$/);
  await expectWizardStep(admin, 'Details');
  await expect(
    admin.getByRole('heading', { name: 'Describe your agent' }),
  ).toBeVisible();
});
