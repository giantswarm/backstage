import {
  expect,
  expectWizardStep,
  open,
  openWizardMoreOptions,
  rosterLinkOf,
  rosterRowOf,
  searchRoster,
  test,
} from './fixtures';

/**
 * Customize's Agents tab as the admin reads it: the roster from the
 * installation's `Agent`s (one row per agent), an agent's detail page, and the
 * first step of the New agent wizard. The roster and the detail page read the worker's own agent
 * (`labAgent`); the whole journey of one is `agent-lifecycle.spec.ts`.
 *
 * Deploy writes the agent's HelmRelease; the roster lists the Agent once Flux
 * has rendered it, polling every 5 s until then (the tab remembers the
 * deploy). Until then a lab without other agents shows the "No agents yet"
 * empty state, so the fixture agent's row comes first; the wait covers a slow
 * Flux render, and the test's budget outlasts the config's 90 s.
 */
const rosterWait = 2 * 60_000;

test('the roster lists the agent with its model, under Customize · Agents', async ({
  admin,
  labAgent,
}) => {
  test.setTimeout(rosterWait + 60_000);
  // The old address lands on Customize's Agents tab, in one hop.
  await open(admin, '/agent-platform/agents');
  await expect(admin).toHaveURL(/\/customize\/agents$/);
  await expect(
    admin.getByRole('main').getByRole('tab', { name: /^Agents/ }),
  ).toHaveAttribute('aria-selected', 'true');
  await searchRoster(admin, labAgent.name);
  const row = rosterRowOf(admin, labAgent.name);
  await expect(row, 'the roster lists the fixture agent').toBeVisible({
    timeout: rosterWait,
  });
  // A row reads its name, its description, the model its ModelConfig
  // serves (the lab's `aiModel`, a Claude model) and what it carries — the
  // fixture agent has no skills and no tools.
  await expect(row).toContainText(
    'Throwaway agent of the Playwright suite; deleted by the same run.',
  );
  await expect(row).toContainText(/claude-/);
  await expect(row).toContainText('0 skills · 0 connectors');
  // The lab runs every agent on one Harness: main's singleHarness rule (#2858)
  // shows neither a Harness filter nor a Harness per row.
  await expect(
    admin.getByRole('button', { name: /^Filter by harness/ }),
  ).toHaveCount(0);
  await expect(admin.getByRole('link', { name: 'New agent' })).toHaveAttribute(
    'href',
    '/customize/agents/new',
  );
});

test('an agent in the roster opens its detail page', async ({
  admin,
  labAgent,
}) => {
  test.setTimeout(rosterWait + 60_000);
  await open(admin, '/customize/agents');
  await searchRoster(admin, labAgent.name);
  const agent = rosterLinkOf(admin, labAgent.name);
  await expect(agent, 'the roster lists the fixture agent').toBeVisible({
    timeout: rosterWait,
  });

  // The row shows the display name; the URL carries the slug — the href is
  // the contract, not the text.
  const href = await agent.getAttribute('href');
  expect(href).toBe(labAgent.detailPath);
  await agent.click();
  await expect(admin).toHaveURL(new RegExp(`${href}$`));
  await expect(
    admin.getByRole('heading', { level: 1, name: labAgent.name }),
  ).toBeVisible();
  // The trail leads back to the list.
  await expect(
    admin
      .getByRole('navigation', { name: 'Breadcrumb' })
      // Exact: the back arrow's "Back to Agents" also contains the name.
      .getByRole('link', { name: 'Agents', exact: true }),
  ).toHaveAttribute('href', '/customize/agents');
  // The shell's tabs, Overview's sections and the facts beside them. No
  // Tools tab: the fixture agent has no tools.
  await expect(
    admin.getByRole('main').getByRole('tablist').getByRole('tab'),
  ).toHaveText(['Overview', 'Sessions', 'Usage']);
  for (const section of ['What it’s for', 'Instructions']) {
    await expect(admin.getByRole('region', { name: section })).toBeVisible();
  }
  await expect(
    admin
      .getByRole('complementary', { name: 'About this agent' })
      .getByRole('link', { name: 'default-model-config' }),
  ).toBeVisible();
  await admin.getByRole('tab', { name: 'Sessions' }).click();
  await expect(admin).toHaveURL(new RegExp(`${href}/sessions$`));
  await expect(
    admin.getByRole('button', { name: 'Edit', exact: true }),
  ).toBeVisible();
  await expect(
    admin.getByRole('button', { name: 'Agent actions' }),
  ).toBeVisible();

  // An agent without tools has no Tools tab, so its address lands on the
  // Overview.
  await open(admin, `${href}/tools`);
  await expect(admin).toHaveURL(new RegExp(`${href}$`));
  await expect(
    admin.getByRole('tab', { name: 'Overview', exact: true }),
  ).toHaveAttribute('aria-selected', 'true');
});

test('the New agent wizard opens on Details, derives the technical name and lists the ModelConfigs', async ({
  admin,
}) => {
  await open(admin, '/customize/agents');
  await admin.getByRole('link', { name: 'New agent' }).click();
  await expect(admin).toHaveURL(/\/customize\/agents\/new$/);
  await expectWizardStep(admin, 'Details');
  await expect(
    admin.getByRole('heading', { name: 'Describe your agent' }),
  ).toBeVisible();

  await admin
    .getByRole('textbox', { name: 'Name', exact: true })
    .fill('E2E Probe Agent');
  await expect(
    admin.getByText(
      'Its technical name is e2e-probe-agent; it cannot be changed once the agent exists.',
    ),
    'the irreversible technical name is said beside the name (M7)',
  ).toBeVisible();
  await openWizardMoreOptions(admin);
  await expect(
    admin.getByRole('textbox', { name: 'Technical name' }),
    'the technical name follows the name',
  ).toHaveValue('e2e-probe-agent');

  const models = admin.getByRole('radiogroup', { name: 'Model' });
  await expect(
    models.getByRole('radio', { name: /default-model-config/ }),
    'the ModelConfigs an admin provisioned are offered',
  ).toBeVisible();

  // Cancel on a dirty form asks first, then goes back to the list it came from.
  await admin.getByRole('link', { name: 'Cancel' }).click();
  await admin
    .getByRole('dialog')
    .filter({ hasText: 'Discard your changes?' })
    .getByRole('button', { name: 'Discard changes' })
    .click();
  await expect(admin).toHaveURL(/\/customize\/agents$/);
});
