import type { Page } from '@playwright/test';
import { completeDexLogin, expect, open, test } from './fixtures';
import { lab } from './lab';

/**
 * The MCP servers page (the muster plugin) as the admin uses it: one table of
 * the installation's servers -- a family one row, muster itself one row --
 * its search over server and tool names, the muster session behind **Connect
 * to muster**, a server's page and a tool's page, and the per-server **Sign
 * in** the lab's `Auth Required` fixture exists for -- an OAuth-protected
 * server whose authorization server is muster itself, so the challenge chain
 * (proxy start → muster → Dex) is real.
 */

const serversPath = `/agent-platform/muster/servers?installation=${lab.installation}`;

/** A server's link in the servers table: its name, then its description. */
function serverLink(page: Page, name: string) {
  return page.getByRole('link', { name: new RegExp(`^${name}`) });
}

test('lists the installation servers in one table, muster included', async ({
  admin,
}) => {
  await open(admin, serversPath);
  // Exact: the section's own tab is "MCP Servers", the sub-tab "Servers".
  await expect(
    admin.getByRole('tab', { name: 'Servers', exact: true }),
  ).toHaveAttribute('aria-selected', 'true');
  for (const name of [
    'agent-manager',
    'lab-oauth-fixture',
    'mcp-kubernetes',
    'muster',
  ]) {
    await expect(serverLink(admin, name)).toBeVisible();
  }
  await expect(
    admin.getByRole('columnheader', { name: 'Source' }),
  ).toBeVisible();
});

/**
 * Opens the muster session for the page's user when the page shows the gate.
 * The backend keeps that session server-side per user, so a page that
 * connected earlier in the run finds no gate — the same signed-in portal.
 *
 * The gate also renders while the session probe is still pending and unmounts
 * the moment the probe says authenticated, so a click can land on an element
 * that just left the DOM: click while it is there, judge by its absence.
 */
async function connectToMuster(page: Page) {
  const gate = page.getByRole('button', { name: 'Connect to muster' });
  const table = page.getByRole('grid');
  await expect(gate.or(table).first()).toBeVisible();
  await expect
    .poll(
      async () => {
        if (!(await gate.isVisible())) {
          return 'connected';
        }
        await gate.click({ timeout: 2_000 }).catch(() => undefined);
        return 'gate';
      },
      {
        timeout: 90_000,
        intervals: [1_000],
        message:
          'the muster session did not open within 90 s — the lab muster may be unhealthy (`kubectl -n agent-platform get pods`), or the backend cached an unreachable probe after a pod roll (5 min TTL)',
      },
    )
    .toBe('connected');
}

test('searching a tool name narrows the list to the servers offering it', async ({
  admin,
}) => {
  await open(admin, serversPath);
  await connectToMuster(admin);
  await admin
    .getByRole('searchbox', { name: 'Search servers and tools' })
    .fill('mcpserver_list');

  const muster = serverLink(admin, 'muster');
  await expect(muster, 'muster offers core_mcpserver_list').toBeVisible({
    timeout: 60_000,
  });
  await expect(admin.getByText(/^\d+ of \d+ match$/).first()).toBeVisible();
  await expect(serverLink(admin, 'lab-oauth-fixture')).toHaveCount(0);

  await muster.click();
  await expect(admin).toHaveURL(/\/servers\/muster\?.*q=mcpserver_list/);
  await expect(
    admin.getByRole('link', { name: 'mcpserver_list', exact: true }),
  ).toBeVisible({ timeout: 60_000 });
});

test('Connect to muster opens the session, and the OAuth fixture signs in per server through Dex', async ({
  admin,
}) => {
  test.setTimeout(180_000);
  await open(admin, serversPath);
  await connectToMuster(admin);
  await serverLink(admin, 'lab-oauth-fixture').click();
  await admin.getByRole('tab', { name: 'Overview' }).click();

  // For about a minute after a muster pod roll the fixture's CR reads Failed
  // (muster dials itself before its own listener is up) and offers no sign-in;
  // it settles back to Auth Required on its own.
  await expect(
    admin.getByRole('heading', { name: 'lab-oauth-fixture' }).locator('..'),
    'the fixture CR has settled (Auth Required, or Connected from an earlier sign-in)',
  ).toContainText(/Auth Required|Connected/, { timeout: 120_000 });
  await expect(admin.getByText(/Lab fixture/)).toBeVisible();

  // The per-server session is muster's, per user, and outlives a page: a
  // previous run may have left the fixture signed in — sign out first, so
  // the flow under test is the sign-in. The Overview's Authentication card
  // carries both; the page header repeats Sign in, hence `.last()`.
  const signIn = admin.getByRole('button', { name: 'Sign in' }).last();
  const signOut = admin.getByRole('button', { name: 'Sign out' });
  await expect(
    signIn.or(signOut).first(),
    'an OAuth server offers Sign in or Sign out once the muster session is open',
  ).toBeVisible();
  if (await signOut.isVisible()) {
    await signOut.click();
    await expect(signIn).toBeVisible({ timeout: 60_000 });
  }

  // The per-server Sign in: a popup through muster's OAuth proxy to the lab
  // Dex, completed with the same fixture account.
  const popup = admin.waitForEvent('popup');
  await signIn.click();
  await completeDexLogin(await popup, lab.users.admin);
  await expect(
    signOut,
    'the server page now offers Sign out for this session',
  ).toBeVisible({ timeout: 60_000 });
});

test('the Tool explorer lists tools once the session is open', async ({
  admin,
}) => {
  await open(
    admin,
    `/agent-platform/muster/tools?installation=${lab.installation}`,
  );
  await expect(
    admin.getByRole('tab', { name: 'Tool explorer' }),
  ).toHaveAttribute('aria-selected', 'true');
  const gate = admin.getByRole('button', { name: 'Connect to muster' });
  if (await gate.isVisible().catch(() => false)) {
    await gate.click();
    await expect(gate).toBeHidden({ timeout: 90_000 });
  }
  // The explorer lists on search; muster's own core tools are always there.
  await admin.getByRole('searchbox', { name: 'Search tools' }).fill('core_');
  await expect(
    admin.getByText(/^\d+ match/),
    'the search reports its matches',
  ).toBeVisible({ timeout: 60_000 });
  await expect(
    admin.getByText(/^core_/).first(),
    "muster's core tools are listed",
  ).toBeVisible();
});

test("a row opens its server page, with the server's tabs", async ({
  admin,
}) => {
  await open(admin, serversPath);
  await connectToMuster(admin);
  await serverLink(admin, 'mcp-kubernetes').click();

  await expect(
    admin.getByRole('heading', { name: 'mcp-kubernetes' }),
  ).toBeVisible();
  await expect(admin).toHaveURL(
    new RegExp(
      `/agent-platform/muster/servers/mcp-kubernetes\\?installation=${lab.installation}$`,
    ),
  );
  // Tools is the server page's index: a server link lands on its tools.
  await expect(admin.getByRole('tab', { name: /^Tools/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(
    admin.getByRole('searchbox', { name: 'Filter tools' }),
    'the Tools tab lists the server’s tools',
  ).toBeVisible({ timeout: 60_000 });
  for (const tab of [/^Resources/, /^Prompts/, /^Overview/]) {
    await expect(admin.getByRole('tab', { name: tab })).toBeVisible();
  }

  await admin.getByRole('tab', { name: 'Overview' }).click();
  await expect(admin).toHaveURL(
    new RegExp(
      `/agent-platform/muster/servers/mcp-kubernetes/overview\\?installation=${lab.installation}$`,
    ),
  );
  await expect(admin.getByText('Configuration').first()).toBeVisible();
});

test("muster's own server page lists its core tools, and a tool page runs one", async ({
  admin,
}) => {
  test.setTimeout(120_000);
  await open(admin, serversPath);
  await connectToMuster(admin);
  await open(
    admin,
    `/agent-platform/muster/servers/muster?installation=${lab.installation}`,
  );

  // Read-only, and there on every muster: the aggregator's own server list.
  const tool = admin.getByRole('link', { name: 'mcpserver_list', exact: true });
  await expect(tool).toBeVisible({ timeout: 60_000 });
  await tool.click();

  await expect(
    admin.getByRole('heading', { name: 'mcpserver_list' }),
  ).toBeVisible();
  await expect(admin.getByText('core_mcpserver_list')).toBeVisible();
  const trail = admin.getByRole('navigation', { name: 'Breadcrumb' });
  await expect(trail.getByRole('link', { name: 'muster' })).toBeVisible();

  await admin.getByRole('button', { name: 'Execute' }).click();
  await expect(
    admin.getByText('Result', { exact: true }),
    'the tool ran through the call proxy',
  ).toBeVisible({ timeout: 60_000 });
});
