import type { Page } from '@playwright/test';
import { expect, open, test } from './fixtures';

/**
 * The Agent Platform in the agent shell, on a lab serving both portals
 * (`AGENTLAB_PORTAL_MODE=shell`): `/agent-platform/**` renders in the shell
 * and never in classic chrome, the shell's rail reaches its sections, and the
 * two portals cross-link — the shell's Platform Portal item into the classic
 * portal, the classic sidebar's Agent Platform item into the shell, each in a
 * new tab.
 */

const rail = (page: Page) =>
  page.getByRole('navigation', { name: 'Main', exact: true });

test('every Agent Platform route renders in the shell, never in classic chrome', async ({
  admin,
}) => {
  for (const path of [
    '/agent-platform',
    '/agent-platform/sessions',
    '/agent-platform/agents',
    '/agent-platform/models',
    '/agent-platform/connectors',
    '/agent-platform/workflows',
    '/agent-platform/usage',
    '/agent-platform/profile',
    '/customize',
  ]) {
    await open(admin, path);
    await expect(rail(admin), `${path} is in the shell`).toBeAttached();
    await expect(
      admin.getByRole('navigation', { name: 'sidebar nav' }),
      `${path} has no classic sidebar`,
    ).not.toBeAttached();
    await expect(
      admin.getByText(/something went wrong|error boundary/i),
      `${path} renders without an error boundary`,
    ).toBeHidden();
  }
});

test('a bare /agent-platform lands on Sessions', async ({ admin }) => {
  await open(admin, '/agent-platform');
  await expect(
    admin.getByRole('heading', { level: 1, name: 'Sessions' }),
  ).toBeVisible();
});

test('the old MCP Servers address lands on Customize · Connectors', async ({
  admin,
}) => {
  await open(admin, '/agent-platform/mcp-servers');
  await expect(admin).toHaveURL(/\/customize\/connectors$/);
  await expect(
    admin.getByRole('main').getByRole('tab', { name: /^Connectors/ }),
  ).toHaveAttribute('aria-selected', 'true');
});

test('the rail reaches the shell’s sections', async ({ admin }) => {
  await open(admin, '/agent-platform');
  const nav = rail(admin);
  // The expanded rail: its items, Search (a button: the command palette)
  // after New session, and the recent sessions under them with the link to
  // them all (the phone's bar has a Sessions item instead,
  // `mobile-navigation.spec.ts`).
  for (const [name, href] of [
    ['New session', '/'],
    ['Customize', '/customize'],
    ['Usage', '/agent-platform/usage'],
    ['All sessions', '/agent-platform/sessions'],
  ] as const) {
    await expect(nav.getByRole('link', { name, exact: true })).toHaveAttribute(
      'href',
      href,
    );
  }
  await expect(nav.getByRole('button', { name: /^Search/ })).toBeVisible();
  await expect(
    nav.getByRole('link', { name: 'Sessions', exact: true }),
    'no Sessions item in the desktop rail',
  ).toHaveCount(0);
});

test('the shell and the classic portal cross-link in new tabs', async ({
  admin,
}) => {
  await open(admin, '/agent-platform');
  const portal = rail(admin).getByRole('link', { name: 'Platform Portal' });
  await expect(portal).toHaveAttribute('href', '/clusters');
  await expect(portal).toHaveAttribute('target', '_blank');

  await open(admin, '/clusters');
  const sidebar = admin.getByRole('navigation', { name: 'sidebar nav' });
  const agentPlatform = sidebar.getByRole('link', { name: 'Agent Platform' });
  await expect(agentPlatform).toHaveAttribute('href', '/agent-platform');
  await expect(agentPlatform).toHaveAttribute('target', '_blank');
});

test('/agent-platform/usage carries Overview · Cost · Your sessions · Connectors and each renders on click', async ({
  admin,
}) => {
  // The PO's order (T90): Connectors last. It is offered where the muster
  // plugin contributes it, which the lab registers.
  const names = ['Overview', 'Cost', 'Your sessions', 'Connectors'];
  await open(admin, '/agent-platform/usage');
  const row = admin.getByRole('main').getByRole('tablist').first();
  await expect(row.getByRole('tab')).toHaveText(names);
  for (const name of names) {
    await row.getByRole('tab', { name }).click();
    await expect(row.getByRole('tab', { name })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(
      admin.getByText(/something went wrong|error boundary/i),
      `${name} renders without an error boundary`,
    ).toBeHidden();
  }
});
