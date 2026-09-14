import type { Locator, Page } from '@playwright/test';
import { completeDexLogin, expect, open, test } from './fixtures';
import { lab } from './lab';

/**
 * The MCP servers page (the muster plugin) as the admin uses it: the three
 * groups the tool-group label sorts the installation's `MCPServer` CRs into,
 * a row's disclosure, the muster session behind **Connect to muster**, and
 * the per-server **Sign in** the lab's `Auth Required` fixture exists for —
 * an OAuth-protected server whose authorization server is muster itself, so
 * the challenge chain (proxy start → muster → Dex) is real.
 */

const serversPath = `/agent-platform/muster/servers?installation=${lab.installation}`;

/** A server's row within `scope` (the page or a group's region): the disclosure button named after the server. */
function serverRow(scope: Page | Locator, name: string) {
  return scope.getByRole('button', { name: new RegExp(`^${name} `) });
}

test('groups the installation servers into Agent Platform, Infrastructure and Registered servers', async ({
  admin,
}) => {
  await open(admin, serversPath);
  // Exact: the section's own tab is "MCP Servers", the sub-tab "Servers".
  await expect(
    admin.getByRole('tab', { name: 'Servers', exact: true }),
  ).toHaveAttribute('aria-selected', 'true');
  for (const group of [
    'Agent Platform',
    'Infrastructure',
    'Registered servers',
  ]) {
    await expect(admin.getByRole('region', { name: group })).toBeVisible();
  }

  const platform = admin.getByRole('region', { name: 'Agent Platform' });
  await expect(serverRow(platform, 'muster')).toBeVisible();
  await expect(serverRow(platform, 'agent-manager')).toBeVisible();
  await expect(
    serverRow(
      admin.getByRole('region', { name: 'Infrastructure' }),
      'mcp-kubernetes',
    ),
  ).toBeVisible();
  await expect(
    serverRow(
      admin.getByRole('region', { name: 'Registered servers' }),
      'lab-oauth-fixture',
    ),
  ).toBeVisible();
});

test("a row's disclosure shows the server's configuration and token chain", async ({
  admin,
}) => {
  await open(admin, serversPath);
  const row = serverRow(admin, 'mcp-kubernetes');
  await row.click();
  await expect(row).toHaveAttribute('aria-expanded', 'true');
  const detail = admin.getByRole('group', { name: /^mcp-kubernetes / });
  await expect(detail.getByText('Configuration')).toBeVisible();
  await expect(detail.getByText('Authentication / token chain')).toBeVisible();
  await expect(detail.getByText('GitOps provenance')).toBeVisible();
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
  const groups = page.getByRole('region', { name: 'Agent Platform' });
  await expect(gate.or(groups).first()).toBeVisible();
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

test('Connect to muster opens the session, and the OAuth fixture signs in per server through Dex', async ({
  admin,
}) => {
  test.setTimeout(180_000);
  await open(admin, serversPath);
  await connectToMuster(admin);

  const registered = admin.getByRole('region', { name: 'Registered servers' });
  const row = serverRow(registered, 'lab-oauth-fixture');
  // For about a minute after a muster pod roll the fixture's CR reads Failed
  // (muster dials itself before its own listener is up) and offers no sign-in;
  // it settles back to Auth Required on its own.
  await expect(
    row,
    'the fixture CR has settled (Auth Required, or Connected from an earlier sign-in)',
  ).toContainText(/Auth Required|Connected/, { timeout: 120_000 });
  await row.click();
  const detail = admin.getByRole('group', { name: /^lab-oauth-fixture / });
  await expect(detail.getByText(/Lab fixture/)).toBeVisible();

  // The per-server session is muster's, per user, and outlives a page: a
  // previous run may have left the fixture signed in — sign out first, so
  // the flow under test is the sign-in.
  const signIn = detail.getByRole('button', { name: 'Sign in' });
  const signOut = detail.getByRole('button', { name: 'Sign out' });
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
    'the disclosure now offers Sign out for this session',
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
