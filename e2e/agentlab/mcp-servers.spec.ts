import type { Page } from '@playwright/test';
import {
  completeDexLogin,
  connectToMuster,
  expect,
  open,
  test,
} from './fixtures';
import { lab } from './lab';

/**
 * Connectors (the muster plugin) in the agent shell, as the admin uses them:
 * Customize's Connectors tab — the installation's connectors on three
 * sub-tabs (the customer's own, the infrastructure's, a family one row, and the
 * platform's internal servers with muster itself) — its search over connector
 * and tool names, the muster
 * session behind **Connect to muster**, a connector's page with its tabs, a
 * tool tried in place, and the per-connector **Sign in** the lab's
 * `Auth Required` fixture exists for — an OAuth-protected server whose
 * authorization server is muster itself, so the challenge chain (proxy start →
 * muster → Dex) is real.
 */

const scope = `?installation=${lab.installation}`;
const connectorsPath = `/agent-platform/connectors${scope}`;
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

/** A connector's row in the table: its name, then its description. */
function connectorRow(page: Page, name: string) {
  return page.getByRole('row', { name: new RegExp(`^${name}( |$)`) });
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
  await expect(connectorRow(admin, 'lab-oauth-fixture')).toBeVisible();
  for (const name of ['agent-manager', KUBERNETES_FAMILY, 'muster']) {
    await expect(connectorRow(admin, name)).toHaveCount(0);
  }
  // The fixture asks each person to sign in, right from its row.
  const fixture = connectorRow(admin, 'lab-oauth-fixture');
  await expect(fixture).toContainText('Your own account');
  await expect(fixture.getByRole('button', { name: 'Sign in' })).toBeVisible();
  await expect(
    admin.getByRole('link', { name: 'Add connector' }),
  ).toHaveAttribute('href', '/agent-platform/connectors/new');
});

test('Infrastructure lists the infrastructure servers, Internal the platform’s servers and muster', async ({
  admin,
}) => {
  await open(admin, infrastructurePath);
  await connectToMuster(admin, admin.getByRole('grid'));
  await expect(connectorRow(admin, KUBERNETES_FAMILY)).toBeVisible();
  await expect(connectorRow(admin, 'lab-oauth-fixture')).toHaveCount(0);

  await admin.getByRole('tab', { name: /^Internal/ }).click();
  await expect(admin).toHaveURL(
    new RegExp(`/customize/connectors/internal\\${scope}$`),
  );
  await expect(connectorRow(admin, 'agent-manager')).toBeVisible();
  const muster = connectorRow(admin, 'muster');
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

test('the tab’s old mcp-servers address redirects to connectors, path and query kept', async ({
  admin,
}) => {
  await open(
    admin,
    `/agent-platform/mcp-servers/${KUBERNETES_FAMILY}/instances${scope}`,
  );
  await expect(admin).toHaveURL(
    new RegExp(
      `/agent-platform/connectors/${KUBERNETES_FAMILY}/instances\\?installation=${lab.installation}$`,
    ),
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

  const kubernetes = connectorRow(admin, KUBERNETES_FAMILY);
  await expect(kubernetes, 'kubernetes offers cluster_health').toBeVisible({
    timeout: 60_000,
  });
  await expect(connectorRow(admin, 'lab-oauth-fixture')).toHaveCount(0);
  await expect(connectorRow(admin, 'agent-manager')).toHaveCount(0);

  await kubernetes.getByRole('rowheader').click();
  // Its Tools tab opens on the same search, at the tools that matched.
  await expect(admin).toHaveURL(
    new RegExp(
      `/agent-platform/connectors/${KUBERNETES_FAMILY}\\?.*q=cluster_health`,
    ),
  );
  await expect(
    admin.getByRole('searchbox', { name: 'Search tools', exact: true }),
  ).toHaveValue('cluster_health');
  await expect(
    admin.getByRole('button', { name: /^cluster_health/ }),
  ).toBeVisible({ timeout: 60_000 });
});

test('Connect to muster opens the session, and the OAuth fixture signs in per connector through Dex', async ({
  admin,
}) => {
  test.setTimeout(180_000);
  await open(admin, connectorsPath);
  await connectToMuster(admin, admin.getByRole('grid'));
  await open(admin, `/agent-platform/connectors/lab-oauth-fixture${scope}`);

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
  // header's More actions), so the flow under test is the sign-in.
  const signIn = admin.getByRole('button', { name: 'Sign in' }).first();
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
  await connectorRow(admin, KUBERNETES_FAMILY).getByRole('rowheader').click();

  await expect(
    admin.getByRole('heading', {
      level: 1,
      name: KUBERNETES_FAMILY,
      exact: true,
    }),
  ).toBeVisible();
  await expect(admin).toHaveURL(
    new RegExp(
      `/agent-platform/connectors/${KUBERNETES_FAMILY}\\?installation=${lab.installation}$`,
    ),
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
    admin.getByRole('button', { name: /^list List Kubernetes resources/ }),
    'the Tools tab lists the connector’s tools',
  ).toBeVisible({ timeout: 60_000 });
  // A family's members are its Instances: the lab's own cluster among them.
  await admin.getByRole('tab', { name: /^Instances/ }).click();
  await expect(admin).toHaveURL(
    new RegExp(
      `/agent-platform/connectors/${KUBERNETES_FAMILY}/instances\\?installation=${lab.installation}$`,
    ),
  );
  await expect(
    admin.getByRole('link', { name: lab.mcpKubernetes, exact: true }),
    "the lab's cluster is the family's member",
  ).toBeVisible();
  await expect(admin.getByRole('tab', { name: 'Used by' })).toBeVisible();
});

test("muster's own connector page lists its core tools, and one is tried in place", async ({
  admin,
}) => {
  test.setTimeout(120_000);
  await open(admin, internalPath);
  await connectToMuster(admin, admin.getByRole('grid'));
  await connectorRow(admin, 'muster').getByRole('rowheader').click();
  await expect(admin).toHaveURL(
    new RegExp(`/agent-platform/connectors/muster\\${scope}$`),
  );
  // Its endpoint sits above the tabs, with its copy button.
  await expect(admin.getByText(/^Endpoint https?:\/\//)).toBeVisible();
  await expect(
    admin.getByRole('button', { name: 'Copy endpoint' }),
  ).toBeVisible();

  // Read-only, and there on every muster: the aggregator's own server list.
  const tool = admin.getByRole('button', { name: /^mcpserver_list/ });
  await expect(tool).toBeVisible({ timeout: 60_000 });
  await tool.click();
  await expect(admin.getByText('Try it', { exact: true })).toBeVisible();
  await expect(admin.getByText(/Nothing is changed\./).first()).toBeVisible();

  await admin.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(
    admin.getByText('Result', { exact: true }),
    'the tool ran through the call proxy',
  ).toBeVisible({ timeout: 60_000 });
});

test("a connector's Details tab folds its resource and auth chain, read from the CR", async ({
  admin,
}) => {
  await open(
    admin,
    `/agent-platform/connectors/lab-oauth-fixture/details${scope}`,
  );
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
  await open(
    admin,
    `/agent-platform/connectors/${KUBERNETES_FAMILY}/details${scope}`,
  );
  await openTechnicalDetails(admin);
  await expect(
    admin.getByText(/each instance's own configuration, health and/),
  ).toBeVisible();
});
