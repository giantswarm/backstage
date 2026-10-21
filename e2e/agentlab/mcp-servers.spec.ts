import type { Page } from '@playwright/test';
import {
  completeDexLogin,
  connectToMuster,
  expect,
  open,
  test,
} from './fixtures';
import { connectorRow, INVENTORY_REJECTED_TOKEN, SHOWN } from './connectors';
import { lab } from './lab';

/**
 * Connectors (the muster plugin) in the agent shell, as the admin uses them:
 * Customize's Connectors tab — the installation's connectors on three
 * sub-tabs (the customer's own, the infrastructure's, a family one row, and the
 * platform's internal servers with muster itself) — its search over connector
 * and tool names, the muster
 * session behind **Connect to muster**, a connector's page with its tabs, a
 * tool's own page where it is tried, and the per-connector **Sign in** the lab's
 * `Auth Required` fixture exists for — an OAuth-protected server whose
 * authorization server is muster itself, so the challenge chain (proxy start →
 * muster → Dex) is real.
 */

const scope = `?installation=${lab.installation}`;
const connectorsPath = `/customize/connectors${scope}`;
/** The lab installation's connector pages: the installation is in the path. */
const connectorPages = `/customize/connectors/${lab.installation}`;
const infrastructurePath = `/customize/connectors/infrastructure${scope}`;
const internalPath = `/customize/connectors/internal${scope}`;

/**
 * The family the lab's own cluster joins as `lab.mcpKubernetes`, the way every
 * management cluster does; the table shows a family as one row.
 */
const KUBERNETES_FAMILY = 'kubernetes';

/**
 * Open the Details tab's fold-out. It also opens by itself while the connector
 * reads Failed, and follows a refresh that changes that until it is toggled,
 * so a click can race it: retried until it stays open.
 */
async function openTechnicalDetails(page: Page) {
  const foldOut = page.getByRole('button', { name: 'Technical details' });
  await expect(async () => {
    if ((await foldOut.getAttribute('aria-expanded')) !== 'true') {
      await foldOut.click();
    }
    await expect(foldOut).toHaveAttribute('aria-expanded', 'true', {
      timeout: 1_000,
    });
  }).toPass();
}

test('Customize · Connectors lists the customer’s connectors first, on their own sub-tab', async ({
  admin,
}) => {
  // The old address lands on Customize's Connectors tab, on its default
  // sub-tab.
  await open(admin, connectorsPath);
  await expect(admin).toHaveURL(/\/customize\/connectors\?/);
  await expect(
    admin.getByRole('main').getByRole('tab', { name: /^Connectors/ }),
  ).toHaveAttribute('aria-selected', 'true');
  await expect(
    admin.getByRole('tab', { name: /^Your connectors/ }),
  ).toHaveAttribute('aria-selected', 'true');
  await connectToMuster(admin, admin.getByRole('grid'));
  await expect(admin.getByRole('grid').getByRole('columnheader')).toHaveText([
    'Connector',
    'Sign-in',
    'Tools',
    'Status',
  ]);
  // The fixture carries no tool-group label: it is the customer's.
  await expect(connectorRow(admin, SHOWN.fixture)).toBeVisible();
  for (const name of [SHOWN.agentManager, SHOWN.kubernetes, SHOWN.muster]) {
    await expect(connectorRow(admin, name)).toHaveCount(0);
  }
  // The fixture asks each person to sign in, right from its row.
  const fixture = connectorRow(admin, SHOWN.fixture);
  await expect(fixture).toContainText('Your own account');
  await expect(fixture.getByRole('button', { name: 'Sign in' })).toBeVisible();
  await expect(
    admin.getByRole('link', { name: 'Add connector' }),
  ).toHaveAttribute('href', '/customize/connectors/new');
});

test('Infrastructure lists the infrastructure servers, Internal the platform’s servers and muster', async ({
  admin,
}) => {
  await open(admin, infrastructurePath);
  // A refused inventory probe replaces the views with its gate
  // (inventory-gate.spec.ts): ready on either, so that failure names the gate.
  const inventoryGate = admin.getByText(INVENTORY_REJECTED_TOKEN);
  await connectToMuster(admin, admin.getByRole('grid').or(inventoryGate));
  await expect(
    inventoryGate,
    "the API server accepted the portal's token: no inventory gate",
  ).toHaveCount(0);
  await expect(connectorRow(admin, SHOWN.kubernetes)).toBeVisible();
  await expect(connectorRow(admin, SHOWN.fixture)).toHaveCount(0);

  await admin.getByRole('tab', { name: /^Internal/ }).click();
  await expect(admin).toHaveURL(
    new RegExp(`/customize/connectors/internal\\${scope}$`),
  );
  await expect(connectorRow(admin, SHOWN.agentManager)).toBeVisible();
  const muster = connectorRow(admin, SHOWN.muster);
  await expect(muster).toBeVisible();
  // Its endpoint is on its page, not its row.
  await expect(
    muster.getByRole('button', { name: 'Copy endpoint' }),
  ).toHaveCount(0);
});

test('the old Families address lands on Infrastructure, query kept', async ({
  admin,
}) => {
  await open(admin, `/customize/connectors/families${scope}`);
  await expect(admin).toHaveURL(
    new RegExp(`/customize/connectors/infrastructure\\${scope}$`),
  );
});

test('the tab’s old mcp-servers address redirects in one hop, its installation moved into the path', async ({
  admin,
}) => {
  await open(
    admin,
    `/agent-platform/mcp-servers/${KUBERNETES_FAMILY}/instances${scope}`,
  );
  await expect(admin).toHaveURL(
    new RegExp(`${connectorPages}/${KUBERNETES_FAMILY}/instances$`),
  );
});

test('searching a tool name narrows the table to the connectors offering it', async ({
  admin,
}) => {
  await open(admin, connectorsPath);
  await connectToMuster(admin, admin.getByRole('grid'));
  await admin
    .getByRole('searchbox', { name: 'Search connectors and tools' })
    .fill('cluster_health');

  // Not one of the customer's own: the search says where it is.
  await expect(
    admin.getByText('The search matches 1 connector on Infrastructure.'),
  ).toBeVisible({ timeout: 60_000 });
  await admin
    .getByRole('link', { name: 'Infrastructure', exact: true })
    .click();
  await expect(admin).toHaveURL(/\/customize\/connectors\/infrastructure\?/);

  const kubernetes = connectorRow(admin, SHOWN.kubernetes);
  await expect(kubernetes, 'kubernetes offers cluster_health').toBeVisible({
    timeout: 60_000,
  });
  await expect(connectorRow(admin, SHOWN.fixture)).toHaveCount(0);
  await expect(connectorRow(admin, SHOWN.agentManager)).toHaveCount(0);

  await kubernetes.getByRole('rowheader').click();
  // Its Tools tab opens on the same search, at the tools that matched.
  await expect(admin).toHaveURL(
    new RegExp(`${connectorPages}/${KUBERNETES_FAMILY}\\?.*q=cluster_health`),
  );
  await expect(
    admin.getByRole('searchbox', { name: 'Search tools', exact: true }),
  ).toHaveValue('cluster_health');
  const tool = admin.getByRole('link', { name: /^cluster_health/ }).first();
  await expect(tool).toBeVisible({ timeout: 60_000 });

  // A tool opens on its page; the browser's Back lands on the same search.
  await tool.click();
  await expect(admin).toHaveURL(
    new RegExp(
      `${connectorPages}/${KUBERNETES_FAMILY}/tools/[^?]+\\?.*q=cluster_health`,
    ),
  );
  await admin.goBack();
  await expect(
    admin.getByRole('searchbox', { name: 'Search tools', exact: true }),
  ).toHaveValue('cluster_health');
  await expect(tool).toBeVisible({ timeout: 60_000 });
});

test('Connect to muster opens the session, and the OAuth fixture signs in per connector through Dex', async ({
  admin,
}) => {
  test.setTimeout(180_000);
  await open(admin, connectorsPath);
  await connectToMuster(admin, admin.getByRole('grid'));
  await open(admin, `${connectorPages}/lab-oauth-fixture`);

  // For about a minute after a muster pod roll the fixture's CR reads Failed
  // (muster dials itself before its own listener is up) and offers no sign-in;
  // it settles back to Auth Required on its own.
  const header = admin.getByRole('heading', {
    level: 1,
    name: 'lab-oauth-fixture',
  });
  await expect(header).toBeVisible();
  await expect(
    admin.getByRole('main'),
    'the fixture CR has settled (Auth Required, or Connected from an earlier sign-in)',
  ).toContainText(/Auth Required|Connected/, { timeout: 120_000 });
  // The facts are on the Details tab; the sign-in flow is from Tools.
  await admin.getByRole('tab', { name: 'Details', exact: true }).click();
  await expect(
    admin
      .getByRole('region', { name: 'Connector details' })
      .getByText('Each person signs in with their own account'),
  ).toBeVisible();
  await admin.getByRole('tab', { name: /^Tools/ }).click();

  // The per-server session is muster's, per user, and outlives a page: a
  // previous run may have left the fixture signed in — sign out first (the
  // header's More actions), so the flow under test is the sign-in. The page's
  // own Sign in, not the one of the inbox's MCP sign-in row.
  const signIn = admin
    .getByRole('main')
    .getByRole('button', { name: 'Sign in' })
    .first();
  const moreActions = admin.getByRole('button', { name: 'More actions' });
  const signOut = async () => {
    await moreActions.click();
    await admin.getByRole('menuitem', { name: 'Sign out' }).click();
    await expect(signIn).toBeVisible({ timeout: 60_000 });
  };
  await expect(
    signIn.or(admin.getByRole('tab', { name: /^Tools \([1-9]/ })).first(),
    'an OAuth connector offers Sign in, or its tools once signed in',
  ).toBeVisible({ timeout: 60_000 });
  if (!(await signIn.isVisible())) {
    await signOut();
  }

  // The per-server Sign in: a popup through muster's OAuth proxy to the lab
  // Dex, completed with the same fixture account.
  const popup = admin.waitForEvent('popup');
  await signIn.click();
  await completeDexLogin(await popup, lab.users.admin);
  await expect(signIn, 'signed in, the page no longer asks for it').toBeHidden({
    timeout: 60_000,
  });

  // Leave the fixture as the lab ships it: `agentlab platform-test` expects
  // it among the servers that require a sign-in.
  await signOut();
});

test("a family's row opens its connector page, with the family's tabs", async ({
  admin,
}) => {
  await open(admin, infrastructurePath);
  await connectToMuster(admin, admin.getByRole('grid'));
  await connectorRow(admin, SHOWN.kubernetes).getByRole('rowheader').click();

  await expect(
    admin.getByRole('heading', {
      level: 1,
      name: SHOWN.kubernetes,
      exact: true,
    }),
  ).toBeVisible();
  await expect(admin).toHaveURL(
    new RegExp(`${connectorPages}/${KUBERNETES_FAMILY}$`),
  );
  await expect(
    admin
      .getByRole('navigation', { name: 'Breadcrumb' })
      // Exact: the back arrow's "Back to Connectors" also contains the name.
      .getByRole('link', { name: 'Connectors', exact: true }),
  ).toHaveAttribute('href', '/customize/connectors/infrastructure');
  // Tools is the connector page's index: a connector opens on its tools.
  await expect(admin.getByRole('tab', { name: /^Tools/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(
    admin.getByRole('link', { name: 'list', exact: true }),
    'the Tools tab lists the connector’s tools',
  ).toBeVisible({ timeout: 60_000 });
  // A family's members are its Instances: the lab's own cluster among them.
  await admin.getByRole('tab', { name: /^Instances/ }).click();
  await expect(admin).toHaveURL(
    new RegExp(`${connectorPages}/${KUBERNETES_FAMILY}/instances$`),
  );
  await expect(
    admin.getByRole('link', { name: lab.mcpKubernetes, exact: true }),
    "the lab's cluster is the family's member",
  ).toBeVisible();
  await expect(admin.getByRole('tab', { name: 'Used by' })).toBeVisible();
});

test("a connector's Usage tab shows its tool calls over 30 days, or why it cannot", async ({
  admin,
}) => {
  test.setTimeout(120_000);
  await open(admin, `${connectorPages}/${KUBERNETES_FAMILY}`);
  const usageTab = admin.getByRole('tab', { name: 'Usage', exact: true });
  // Before Used by, as on a model's page.
  await expect(usageTab).toBeVisible();
  await expect(admin.getByRole('tab', { name: 'Used by' })).toBeVisible();
  await usageTab.click();
  await expect(admin).toHaveURL(
    new RegExp(`${connectorPages}/${KUBERNETES_FAMILY}/usage$`),
  );
  await expect(usageTab).toHaveAttribute('aria-selected', 'true');

  // The figures where the lab's muster can read its metrics through a
  // prometheus connector; otherwise the reason, never an error.
  const intro = admin.getByText(
    `Every caller's tool calls to this connector over the last 30 days on ${lab.installation}.`,
    { exact: true },
  );
  const unavailable = admin.getByText(
    /^Usage metrics are not available for this environment:/,
  );
  await connectToMuster(admin, intro.or(unavailable));
  await expect(intro.or(unavailable)).toBeVisible({ timeout: 60_000 });
  await expect(
    admin.getByText("Could not read this connector's usage"),
  ).toHaveCount(0);
  const hasFigures = await intro.isVisible();
  if (hasFigures) {
    for (const label of [
      'Tool calls',
      'Error ratio',
      'p95 latency',
      'Tools used',
    ]) {
      await expect(admin.getByText(label, { exact: true })).toBeVisible();
    }
    await expect(
      admin.getByRole('link', { name: 'Open in Usage', exact: true }),
    ).toHaveAttribute(
      'href',
      `/usage/connectors?installation=${lab.installation}`,
    );
  }

  // Details counts the same 30 days.
  await admin.getByRole('tab', { name: 'Details', exact: true }).click();
  if (hasFigures) {
    await expect(
      admin.getByText('Calls, last 30 days', { exact: true }),
    ).toBeVisible();
  }

  // muster's own page has no Usage tab: no connector counts its tools.
  await open(admin, `${connectorPages}/muster/usage`);
  await expect(admin).toHaveURL(new RegExp(`${connectorPages}/muster$`));
  await expect(
    admin.getByRole('tab', { name: 'Usage', exact: true }),
  ).toHaveCount(0);

  // Usage → Connectors links each connector back to its Usage tab: the lab's
  // kubernetes instance to its family's, which lists the instances. There is
  // a row to check only where the instance was called in the window.
  if (hasFigures) {
    await open(admin, `/usage/connectors${scope}`);
    const table = admin.getByRole('columnheader', {
      name: 'Connector',
      exact: true,
    });
    const noCalls = admin.getByText(
      /^No tool calls were dispatched to connectors/,
    );
    await connectToMuster(admin, table.or(noCalls));
    await expect(table.or(noCalls)).toBeVisible({ timeout: 60_000 });
    const kubernetes = admin.getByRole('link', {
      name: SHOWN.kubernetes,
      exact: true,
    });
    if ((await kubernetes.count()) > 0) {
      await expect(kubernetes).toHaveAttribute(
        'href',
        `${connectorPages}/${KUBERNETES_FAMILY}/usage`,
      );
    }
  }
});

test("muster's own connector page lists its core tools, and one opens on its page and runs there", async ({
  admin,
}) => {
  test.setTimeout(120_000);
  await open(admin, internalPath);
  await connectToMuster(admin, admin.getByRole('grid'));
  await connectorRow(admin, SHOWN.muster).getByRole('rowheader').click();
  await expect(admin).toHaveURL(new RegExp(`${connectorPages}/muster$`));
  // Its endpoint sits above the tabs, with its copy button.
  await expect(admin.getByText(/^Endpoint https?:\/\//)).toBeVisible();
  await expect(
    admin.getByRole('button', { name: 'Copy endpoint' }),
  ).toBeVisible();

  // Read-only, and there on every muster: the aggregator's own server list.
  // The row is a link to the tool's page; nothing runs from the list.
  const tool = admin.getByRole('link', { name: 'mcpserver_list', exact: true });
  await expect(tool).toBeVisible({ timeout: 60_000 });
  await tool.click();
  await expect(admin).toHaveURL(
    new RegExp(`${connectorPages}/muster/tools/core_mcpserver_list$`),
  );
  await expect(
    admin.getByRole('heading', { level: 1, name: 'mcpserver_list' }),
  ).toBeVisible();
  await expect(
    admin.getByRole('heading', { level: 2, name: 'Try it', exact: true }),
  ).toBeVisible({ timeout: 60_000 });
  await expect(admin.getByText(/Nothing is changed\./).first()).toBeVisible();

  await admin.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(
    admin.getByRole('heading', { level: 2, name: 'Result', exact: true }),
    'the tool ran through the call proxy',
  ).toBeVisible({ timeout: 60_000 });

  // The way back is the connector's Tools tab.
  await admin
    .getByRole('navigation', { name: 'Breadcrumb' })
    .getByRole('link', { name: 'muster', exact: true })
    .click();
  await expect(admin).toHaveURL(new RegExp(`${connectorPages}/muster$`));
  await expect(admin.getByRole('tab', { name: /^Tools/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});

test("an old MCP servers address of a tool lands on the tool's page, in one hop", async ({
  admin,
}) => {
  await open(
    admin,
    `/agent-platform/mcp-servers/muster/tools/core_mcpserver_list${scope}`,
  );
  await expect(admin).toHaveURL(
    new RegExp(`${connectorPages}/muster/tools/core_mcpserver_list$`),
  );
  await expect(
    admin.getByRole('heading', { level: 1, name: 'mcpserver_list' }),
  ).toBeVisible();
});

test("a connector's Details tab folds its resource and auth chain, read from the CR", async ({
  admin,
}) => {
  await open(admin, `${connectorPages}/lab-oauth-fixture/details`);
  await expect(
    admin.getByRole('heading', { level: 1, name: 'lab-oauth-fixture' }),
  ).toBeVisible();

  // Read from the MCPServer itself, so no muster session is needed.
  await openTechnicalDetails(admin);
  await expect(
    admin.getByRole('heading', { name: 'Resource', exact: true }),
  ).toBeVisible();
  await expect(
    admin.getByRole('heading', { name: 'Configuration', exact: true }),
  ).toBeVisible();
  await expect(
    admin.getByText('Own account (OAuth sign-in)', { exact: true }),
  ).toBeVisible();

  // A family shows one instance and leaves the rest to its Instances tab.
  await open(admin, `${connectorPages}/${KUBERNETES_FAMILY}/details`);
  await openTechnicalDetails(admin);
  await expect(
    admin.getByText(/each instance's own configuration, health and/),
  ).toBeVisible();
});
