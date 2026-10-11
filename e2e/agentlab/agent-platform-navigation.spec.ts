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

test('the old MCP Servers address redirects to Connectors', async ({
  admin,
}) => {
  await open(admin, '/agent-platform/mcp-servers');
  await expect(admin).toHaveURL(/\/agent-platform\/connectors$/);
});

test('the rail reaches the shell’s sections', async ({ admin }) => {
  await open(admin, '/agent-platform');
  const nav = rail(admin);
  for (const [name, href] of [
    ['New session', '/'],
    ['Sessions', '/agent-platform/sessions'],
    ['Customize', '/customize'],
    ['Usage', '/agent-platform/usage'],
  ] as const) {
    await expect(nav.getByRole('link', { name })).toHaveAttribute('href', href);
  }
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

test('/agent-platform/usage carries Overview · Cost · Connectors · Your sessions and each renders on click', async ({
  admin,
}) => {
  // Connectors is offered where the muster plugin contributes it, which the
  // lab registers.
  const names = ['Overview', 'Cost', 'Connectors', 'Your sessions'];
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
