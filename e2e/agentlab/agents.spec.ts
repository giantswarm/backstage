import { expect, open, test } from './fixtures';

/**
 * The Agents tab as the admin reads it: the roster from the installation's
 * `AgentTemplate`s, an agent's detail page, and the first step of the New
 * agent wizard. Creating an agent for real is `agent-lifecycle.spec.ts`.
 */

test('the roster shows the agent table with its columns', async ({ admin }) => {
  await open(admin, '/agent-platform/agents');
  await expect(
    admin.getByText('Agents running across your management clusters.'),
  ).toBeVisible();
  const grid = admin.getByRole('grid', { name: 'Data table' });
  await expect(grid.getByRole('columnheader')).toHaveText([
    'Agent',
    'Status',
    'Installation',
    'Namespace',
    'Model',
    'Toolset',
    'Skills',
  ]);
  await expect(admin.getByRole('button', { name: 'New agent' })).toBeVisible();
});

test('an agent in the roster opens its detail page', async ({ admin }) => {
  await open(admin, '/agent-platform/agents');
  const grid = admin.getByRole('grid', { name: 'Data table' });
  await expect(grid).toBeVisible();
  // The table's rows arrive after the CR reads; the header row is always there.
  const agents = grid.getByRole('rowheader').getByRole('link');
  await agents
    .first()
    .waitFor({ timeout: 30_000 })
    .catch(() => undefined);
  test.skip(
    (await agents.count()) === 0,
    'no agent on the installation — agent-lifecycle.spec.ts covers the detail page with its own',
  );

  // The link shows the display name; the URL carries the slug — the href is
  // the contract, not the text.
  const href = await agents.first().getAttribute('href');
  expect(href).toMatch(/^\/agent-platform\/agents\/[^/]+\/[^/]+\/[^/]+$/);
  await agents.first().click();
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
