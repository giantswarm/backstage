import { expect, open, rosterLinkOf, test } from './fixtures';

/**
 * The Agents tab as the admin reads it: the roster from the installation's
 * `Agent`s, an agent's detail page, and the first step of the New
 * agent wizard. The roster and the detail page read the worker's own agent
 * (`labAgent`); the whole journey of one is `agent-lifecycle.spec.ts`.
 *
 * Deploy writes the agent's HelmRelease; the roster lists the Agent once Flux
 * has rendered it and the roster's 60 s poll has read it, up to two minutes
 * after Deploy. Until then a lab without other agents shows the "No agents
 * yet" empty state, without search or table, so the fixture agent's row comes
 * first, and the test's budget outlasts the config's 90 s.
 */
const rosterWait = 2 * 60_000;

test('the roster shows the agent table with its columns', async ({
  admin,
  labAgent,
}) => {
  test.setTimeout(rosterWait + 60_000);
  await open(admin, '/agent-platform/agents');
  await expect(
    rosterLinkOf(admin, labAgent.name),
    'the roster lists the fixture agent',
  ).toBeVisible({ timeout: rosterWait });
  await expect(
    admin.getByRole('searchbox', { name: 'Search agents' }),
  ).toBeVisible();
  // The Namespace and Installation columns join only when the rows span more
  // than one, which depends on what else the lab runs.
  await expect(
    admin.getByRole('grid', { name: 'Data table' }).getByRole('columnheader'),
  ).toContainText(['Agent', 'Status', 'Model', 'Toolset', 'Skills']);
  await expect(admin.getByRole('button', { name: 'New agent' })).toBeVisible();
});

test('an agent in the roster opens its detail page', async ({
  admin,
  labAgent,
}) => {
  test.setTimeout(rosterWait + 60_000);
  await open(admin, '/agent-platform/agents');
  const agent = rosterLinkOf(admin, labAgent.name);
  await expect(agent, 'the roster lists the fixture agent').toBeVisible({
    timeout: rosterWait,
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
