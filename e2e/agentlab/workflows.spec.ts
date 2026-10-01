import type { Page } from '@playwright/test';
import { expect, open, test } from './fixtures';
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

/**
 * Opens the muster session when the Run tab shows its gate; a session opened
 * earlier in the run leaves no gate. The gate unmounts the moment the session
 * probe says authenticated, so click while it is there, judge by the form.
 */
async function connectToMuster(page: Page) {
  const gate = page.getByRole('button', { name: 'Connect to muster' });
  const execute = page.getByRole('button', { name: 'Execute' });
  await expect
    .poll(
      async () => {
        if (await execute.isVisible()) {
          return 'connected';
        }
        if (await gate.isVisible()) {
          await gate.click({ timeout: 2_000 }).catch(() => undefined);
        }
        return 'waiting';
      },
      {
        timeout: 90_000,
        intervals: [1_000],
        message:
          'the Run tab showed no argument form within 90 s — the lab muster may be unhealthy (`kubectl -n agent-platform get pods`)',
      },
    )
    .toBe('connected');
}

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
  await connectToMuster(admin);

  await admin.getByRole('button', { name: 'Execute' }).click();
  await expect(
    admin.getByText('Result', { exact: true }),
    'the workflow ran through the call proxy',
  ).toBeVisible({ timeout: 90_000 });
});
