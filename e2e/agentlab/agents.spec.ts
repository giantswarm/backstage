import { expect, open, test } from './fixtures';

/**
 * The Agents tab as the admin reads it: the roster from the installation's
 * `Agent`s, an agent's detail page, and the first step of the New
 * agent wizard. The roster and the detail page read the worker's own agent
 * (`labAgent`); the whole journey of one is `agent-lifecycle.spec.ts`.
 */

test('the roster shows the agent table with its columns', async ({
  admin,
  labAgent,
}) => {
  await open(admin, '/agent-platform/agents');
  const grid = admin.getByRole('grid', { name: 'Data table' });
  // Deploy writes the agent's HelmRelease; the roster lists the Agent once
  // Flux has rendered it, a poll or two later. Until then a lab without other
  // agents shows the "No agents yet" empty state, without search or table, so
  // the fixture agent's row comes first.
  await expect(
    grid
      .getByRole('rowheader')
      .getByRole('link', { name: labAgent.name, exact: true }),
    'the roster lists the fixture agent',
  ).toBeVisible({ timeout: 2 * 60_000 });
  await expect(
    admin.getByRole('searchbox', { name: 'Search agents' }),
  ).toBeVisible();
  // The lab is one installation with its agents in one namespace, so neither
  // column would tell a row apart.
  await expect(grid.getByRole('columnheader')).toHaveText([
    'Agent',
    'Status',
    'Model',
    'Toolset',
    'Skills',
  ]);
  await expect(admin.getByRole('button', { name: 'New agent' })).toBeVisible();
});

test('an agent in the roster opens its detail page', async ({
  admin,
  labAgent,
}) => {
  await open(admin, '/agent-platform/agents');
  const grid = admin.getByRole('grid', { name: 'Data table' });
  const agent = grid
    .getByRole('rowheader')
    .getByRole('link', { name: labAgent.name, exact: true });
  await expect(agent, 'the roster lists the fixture agent').toBeVisible({
    timeout: 2 * 60_000,
  });

  // The link shows the display name; the URL carries the slug — the href is
  // the contract, not the text.
  const href = await agent.getAttribute('href');
  expect(href).toBe(labAgent.detailPath);
  await agent.click();
  await expect(admin).toHaveURL(new RegExp(`${href}$`));
  await expect(admin.getByRole('link', { name: '← Agents' })).toBeVisible();
  // The Overview tab's cards; the toolset has its own tab since the page was
  // split into Overview, Tools, Skills and Sessions.
  for (const heading of ['Configuration', 'Status', 'System prompt']) {
    await expect(
      admin.getByRole('heading', { level: 3, name: heading }),
    ).toBeVisible();
  }
  await admin.getByRole('tab', { name: 'Tools' }).click();
  await expect(admin).toHaveURL(new RegExp(`${href}/tools$`));
  await expect(
    admin.getByRole('heading', { level: 3, name: 'Toolset' }),
  ).toBeVisible();
  await expect(
    admin.getByRole('button', { name: 'Start a session' }),
  ).toBeVisible();
  await expect(
    admin.getByRole('button', { name: 'Agent actions' }),
  ).toBeVisible();
});

test('the New agent wizard opens on Details, derives the slug and lists the ModelConfigs', async ({
  admin,
}) => {
  await open(admin, '/agent-platform/agents');
  await admin.getByRole('button', { name: 'New agent' }).click();
  await expect(admin).toHaveURL(/\/agent-platform\/agents\/new$/);
  await expect(admin.getByText('Step 1 of 4: Details')).toBeVisible();
  await expect(
    admin.getByRole('heading', { name: 'Create an agent' }),
  ).toBeVisible();

  await admin.getByRole('textbox', { name: 'Name' }).fill('E2E Probe Agent');
  await expect(
    admin.getByRole('textbox', { name: 'Slug' }),
    'the slug follows the name',
  ).toHaveValue('e2e-probe-agent');

  const models = admin.getByRole('radiogroup', { name: 'Model' });
  await expect(
    models.getByRole('radio', { name: /default-model-config/ }),
    'the ModelConfigs an admin provisioned are offered',
  ).toBeVisible();

  await admin.getByRole('button', { name: 'Cancel' }).first().click();
  await expect(admin).toHaveURL(/\/agent-platform\/agents$/);
});
