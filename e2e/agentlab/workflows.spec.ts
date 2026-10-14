import type { Page, Route } from '@playwright/test';
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

/**
 * Stages the lab workflow as rendered by a Flux HelmRelease: the labels the
 * helm-controller stamps, added to the workflow list the page reads, so the
 * page treats it as changed through Git whatever installed it in the lab.
 */
async function stageFluxWorkflow(page: Page) {
  await page.route('**/api/kubernetes/proxy/**', async (route: Route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    const response = await route.fetch();
    const body = await response.json().catch(() => undefined);
    if (body?.kind !== 'WorkflowList' || !Array.isArray(body.items)) {
      await route.fulfill({ response });
      return;
    }
    await route.fulfill({
      response,
      json: {
        ...body,
        items: body.items.map(
          (item: { metadata?: { name?: string; labels?: object } }) =>
            item.metadata?.name === WORKFLOW
              ? {
                  ...item,
                  metadata: {
                    ...item.metadata,
                    labels: {
                      ...item.metadata.labels,
                      'helm.toolkit.fluxcd.io/name': 'e2e-workflows',
                      'helm.toolkit.fluxcd.io/namespace': 'agent-platform',
                    },
                  },
                }
              : item,
        ),
      },
    });
  });
}

test('a GitOps-managed workflow says where in Git to change it, from Edit in Git… in its menu', async ({
  admin,
}) => {
  await stageFluxWorkflow(admin);
  await open(admin, `${workflowPath}?installation=${lab.installation}`);
  await expect(
    admin.getByRole('heading', { level: 1, name: WORKFLOW }),
  ).toBeVisible();

  await admin
    .getByRole('button', { name: 'More actions', exact: true })
    .click();
  await admin
    .getByRole('menuitem', { name: 'Edit in Git…', exact: true })
    .click();

  const dialog = admin.getByRole('dialog');
  await expect(dialog).toContainText(`Edit or remove ${WORKFLOW}`);
  await expect(dialog).toContainText(
    'Managed through GitOps: make the change in Git, or Flux reverts it.',
  );
  // The staged HelmRelease does not exist in the lab, so its source is not
  // found; the dialog still names it and says what to change.
  await expect(dialog).toContainText(
    'HelmRelease agent-platform/e2e-workflows',
    { timeout: 30_000 },
  );
  await expect(dialog).toContainText(
    `Change the values that render ${WORKFLOW}`,
  );
});
