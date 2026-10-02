import { connectToMuster, expect, open, test } from './fixtures';
import { lab } from './lab';

/**
 * A workflow's page (the muster plugin) as the admin uses it: the Workflows
 * tab's list, the workflow page's tabs Overview · Run, and a run from the Run
 * tab. The lab ships one read-only workflow, `lab-cluster-overview`, which
 * lists namespaces and pods through mcp-kubernetes.
 */

const WORKFLOW = 'lab-cluster-overview';
const workflowPath = `/agent-platform/workflows/${WORKFLOW}`;
const scope = `?installation=${lab.installation}`;

test('a workflow opens on Overview, with its tabs', async ({ admin }) => {
  await open(admin, `/agent-platform/workflows${scope}`);
  await admin.getByRole('link', { name: WORKFLOW }).first().click();

  await expect(admin).toHaveURL(
    new RegExp(`${workflowPath}\\?installation=${lab.installation}$`),
  );
  await expect(admin.getByRole('tab', { name: 'Overview' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(admin.getByRole('tab', { name: 'Run' })).toBeVisible();
  await expect(admin.getByText('Steps', { exact: true })).toBeVisible();
});

test('the Run tab runs the workflow', async ({ admin }) => {
  test.setTimeout(180_000);
  await open(admin, `${workflowPath}${scope}`);
  await admin.getByRole('tab', { name: 'Run' }).click();
  await expect(admin).toHaveURL(
    new RegExp(`${workflowPath}/run\\?installation=${lab.installation}$`),
  );
  await connectToMuster(admin, admin.getByRole('button', { name: 'Execute' }));

  await admin.getByRole('button', { name: 'Execute' }).click();
  await expect(
    admin.getByText('Result', { exact: true }),
    'the workflow ran through the call proxy',
  ).toBeVisible({ timeout: 90_000 });
});
