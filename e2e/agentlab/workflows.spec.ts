import type { Page, Route } from '@playwright/test';
import { connectToMuster, expect, open, test } from './fixtures';
import { lab } from './lab';

/**
 * Workflows in the agent shell — agents create and change them through
 * muster, the portal runs them: Customize's Workflows tab lists the
 * installation's workflows, and a workflow's page reads, in tabs, what it is
 * for and how it runs (Overview: the step canvas with the last run on it),
 * runs it with the tool page's form (Run it), its statistics (Usage) and its
 * facts (Details), with its manifest in the ⋮ menu. The lab ships the
 * read-only `lab-cluster-overview`, which lists namespaces and then pods
 * through mcp-kubernetes.
 */

const WORKFLOW = 'lab-cluster-overview';
/** The workflow's page, on the lab installation it runs on. */
const workflowPath = `/customize/workflows/${lab.installation}/${WORKFLOW}`;

test('Customize · Workflows lists the lab workflow and opens its page', async ({
  admin,
}) => {
  // The old list address lands on Customize's Workflows tab, in one hop.
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
  ).toHaveAttribute('href', workflowPath);
  await row.getByRole('rowheader').click();
  await expect(admin).toHaveURL(new RegExp(`${workflowPath}$`));
  await expect(
    admin.getByRole('heading', { level: 1, name: WORKFLOW }),
  ).toBeVisible();
});

test('a workflow’s page loads with its steps on a canvas, a step selectable, nothing to delete and no Run outside Run it', async ({
  admin,
}) => {
  // Smoke-level on purpose: the page's step details are being reworked
  // (T88), so this pins what survives it — the page, its canvas of steps,
  // a step that takes a click, and no write action on Overview: running is
  // the Run it tab's.
  await open(admin, workflowPath);
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
  await open(admin, workflowPath);
  await expect(
    admin.getByRole('heading', { level: 1, name: WORKFLOW }),
  ).toBeVisible();

  await admin
    .getByRole('button', { name: 'More actions', exact: true })
    .click();
  await admin
    .getByRole('menuitem', { name: 'Edit in Git…', exact: true })
    .click();

  // By name: the closing menu's popover is a dialog too for a moment.
  const dialog = admin.getByRole('dialog', {
    name: `Edit or remove ${WORKFLOW}`,
    exact: true,
  });
  await expect(dialog).toBeVisible();
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

test('a workflow’s page keeps its statistics on Usage, its facts on Details and its manifest in the menu', async ({
  admin,
}) => {
  await open(admin, workflowPath);
  await expect(
    admin.getByRole('heading', {
      level: 2,
      name: 'What it’s for',
      exact: true,
    }),
  ).toBeVisible({ timeout: 60_000 });
  // One column: no facts beside the content.
  await expect(admin.getByRole('main').getByRole('complementary')).toHaveCount(
    0,
  );

  await admin.getByRole('tab', { name: 'Usage', exact: true }).click();
  await expect(admin).toHaveURL(new RegExp(`${workflowPath}/usage$`));
  await expect(admin.getByText(/^Every run counts/)).toBeVisible();

  await admin.getByRole('tab', { name: 'Details', exact: true }).click();
  await expect(admin).toHaveURL(new RegExp(`${workflowPath}/details$`));
  const facts = admin.getByRole('region', {
    name: 'Workflow details',
    exact: true,
  });
  await expect(
    facts.getByText(`workflow_${WORKFLOW}`, { exact: true }),
  ).toBeVisible();
  const technical = admin.getByRole('button', {
    name: 'Technical details',
    exact: true,
  });
  await expect(technical).toHaveAttribute('aria-expanded', 'false');
  await technical.click();
  // The facts are a definition list: the term, and its definition beside it.
  await expect(
    admin
      .getByRole('main')
      .locator('dt', { hasText: /^Namespace$/ })
      .locator('xpath=following-sibling::dd[1]'),
  ).toHaveText(/^[a-z0-9-]+$/);

  await admin
    .getByRole('button', { name: 'More actions', exact: true })
    .click();
  await admin
    .getByRole('menuitem', { name: 'View manifest', exact: true })
    .click();
  const dialog = admin.getByRole('dialog', {
    name: 'Workflow manifest',
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('kind: Workflow');
  await expect(dialog).toContainText(`name: ${WORKFLOW}`);
  await expect(
    dialog.getByRole('button', { name: 'Copy manifest', exact: true }),
  ).toBeVisible();
  // The footer's Close; the header's × is named Close too.
  await dialog
    .getByRole('button', { name: 'Close', exact: true })
    .last()
    .click();
  await expect(dialog).toBeHidden();
});

test('a workflow runs from its Run it tab with the tool page’s form, and shows the result', async ({
  admin,
}) => {
  test.setTimeout(150_000);
  await open(admin, workflowPath);
  // After Overview: the tabs read Overview · Run it · Usage · Details.
  await expect(admin.getByRole('tab')).toHaveText([
    'Overview',
    'Run it',
    'Usage',
    'Details',
  ]);
  await admin.getByRole('tab', { name: 'Run it', exact: true }).click();
  await expect(admin).toHaveURL(new RegExp(`${workflowPath}/run$`));

  const run = admin
    .getByRole('main')
    .getByRole('button', { name: 'Run', exact: true });
  await connectToMuster(admin, run);
  // The form, not the skeleton drawn while the workflow's tool is described.
  await expect(run).toBeVisible({ timeout: 60_000 });
  const inputs = admin.getByRole('region', { name: 'Inputs', exact: true });
  // Its one optional input, prefilled by nothing: the workflow's default.
  await expect(
    inputs.getByRole('textbox', { name: /namespace/ }),
  ).toBeVisible();
  // muster marks it read-only, as the badge says.
  await expect(inputs.getByText(/Nothing is changed\./)).toBeVisible();
  await expect(admin.getByText('Only reads', { exact: true })).toBeVisible();

  await run.click();
  await expect(
    admin.getByRole('heading', { level: 2, name: 'Result', exact: true }),
    'the workflow ran through the call proxy',
  ).toBeVisible({ timeout: 90_000 });
  await expect(admin.getByText('Could not run the workflow')).toBeHidden();
});
