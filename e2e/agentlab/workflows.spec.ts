import { expect, open, test } from './fixtures';
import { lab } from './lab';

/**
 * Workflows in the agent shell — their definitions are read-only there
 * (agents create and change them through muster): Customize's Workflows tab
 * lists the installation's workflows, and a workflow's page reads how it runs
 * (the step canvas with the last run on it), its statistics and its facts,
 * and runs it with "Run now". The lab ships the
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

  // The name is a real link (M21): keyboard-reachable, opens in a new tab.
  await expect(
    row.getByRole('link', { name: WORKFLOW, exact: true }),
  ).toHaveAttribute('href', new RegExp(`${workflowPath}\\?installation=`));
  await row.getByRole('rowheader').click();
  await expect(admin).toHaveURL(new RegExp(`${workflowPath}(\\?|$)`));
  await expect(
    admin.getByRole('heading', { level: 1, name: WORKFLOW }),
  ).toBeVisible();
});

test('a workflow’s page loads with its steps on a canvas, a step selectable, nothing to delete', async ({
  admin,
}) => {
  // Smoke-level on purpose: the page's step details are being reworked
  // (T88), so this pins what survives it — the page, its canvas of steps,
  // a step that takes a click, and no delete beside the facts.
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
  await expect(
    admin.getByRole('main').getByRole('button', { name: /^Delete/ }),
  ).toHaveCount(0);
});

test('Run now runs the workflow as the person and shows its result', async ({
  admin,
}) => {
  // The lab workflow only lists namespaces and pods, and its one input has a
  // default, so a run changes nothing and needs no typing.
  await open(admin, `${workflowPath}?installation=${lab.installation}`);
  await admin
    .getByRole('button', { name: 'Run now', exact: true })
    .click({ timeout: 60_000 });
  const dialog = admin.getByRole('dialog');
  await expect(
    dialog.getByRole('heading', { name: `Run ${WORKFLOW}` }),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(dialog.getByText('Result', { exact: true })).toBeVisible({
    timeout: 60_000,
  });
  await expect(dialog.getByText(/could not run/i)).toBeHidden();
});
