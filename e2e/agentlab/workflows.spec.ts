import { expect, open, test } from './fixtures';
import { lab } from './lab';

/**
 * Workflows in the agent shell — read-only there (agents create and change
 * them through muster): Customize's Workflows tab lists the installation's
 * workflows, and a workflow's page reads how it runs (the step canvas with
 * the last run on it), its statistics and its facts. The lab ships the
 * read-only `lab-cluster-overview`, which lists namespaces and then pods
 * through mcp-kubernetes.
 */

const WORKFLOW = 'lab-cluster-overview';
const workflowPath = `/agent-platform/workflows/${WORKFLOW}`;

test('Customize · Workflows lists the lab workflow and opens its page', async ({
  admin,
}) => {
  // The old list address lands on Customize's Workflows tab.
  await open(
    admin,
    `/agent-platform/workflows?installation=${lab.installation}`,
  );
  await expect(admin).toHaveURL(/\/customize\/workflows/);
  const row = admin.getByRole('row', { name: new RegExp(`^${WORKFLOW}`) });
  await expect(row).toBeVisible({ timeout: 60_000 });
  await expect(row.getByRole('gridcell', { name: '2 steps' })).toBeVisible();
  await expect(row.getByRole('gridcell', { name: 'Only reads' })).toBeVisible();

  await row.getByRole('rowheader').click();
  await expect(admin).toHaveURL(new RegExp(`${workflowPath}(\\?|$)`));
  await expect(
    admin.getByRole('heading', { level: 1, name: WORKFLOW }),
  ).toBeVisible();
});

test('a workflow’s page loads with its steps on a canvas, a step selectable, nothing to run or delete', async ({
  admin,
}) => {
  // Smoke-level on purpose: the page's step details are being reworked
  // (T88), so this pins what survives it — the page, its canvas of steps,
  // a step that takes a click, and no write action beside the facts.
  await open(admin, `${workflowPath}?installation=${lab.installation}`);
  await expect(
    admin.getByRole('heading', { level: 1, name: WORKFLOW }),
  ).toBeVisible();
  await expect(
    admin
      .getByRole('navigation', { name: 'Breadcrumb' })
      // Exact: the back arrow's "Back to Workflows" also contains the name.
      .getByRole('link', { name: 'Workflows', exact: true }),
  ).toHaveAttribute('href', '/customize/workflows');
  const steps = admin
    .getByRole('main')
    .getByRole('button', { name: /^Step \d+:/ });
  await expect(steps.first()).toBeVisible({ timeout: 60_000 });
  expect(await steps.count()).toBeGreaterThanOrEqual(2);
  await steps.first().click();
  await expect(
    admin.getByText(/something went wrong|error boundary/i),
  ).toBeHidden();
  for (const name of [/^Run$/, /^Execute$/, /^Delete/]) {
    await expect(
      admin.getByRole('main').getByRole('button', { name }),
    ).toHaveCount(0);
  }
});
