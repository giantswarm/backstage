import { agentPlatformTabs, expect, open, test } from './fixtures';

/**
 * Every page the lab's portal offers renders its chrome and its own controls:
 * the sidebar, the Agent Platform section with its tabs and sub-tabs, and the
 * Giant Swarm pages the lab enables. A broken bundle, a route that lost its
 * page or a tab row that lost a tab fails here before any deeper spec runs.
 */

test('the sidebar links to every enabled page', async ({ admin }) => {
  await open(admin, '/');
  const nav = admin.getByRole('navigation', { name: 'sidebar nav' });
  for (const [name, href] of [
    ['Catalog', '/catalog'],
    ['Docs', '/docs'],
    ['Deployments', '/deployments'],
    ['Clusters', '/clusters'],
    ['Agent Platform', '/agent-platform'],
    ['Create...', '/create'],
    ['Settings', '/settings'],
  ] as const) {
    await expect(nav.getByRole('link', { name })).toHaveAttribute('href', href);
  }
  // The lab's app-config sends the root to the Agent Platform section, which
  // opens on its first tab.
  await expect(admin).toHaveURL(/\/agent-platform\/sessions$/);
});

test('the Agent Platform section shows its tabs and selects each on click', async ({
  admin,
}) => {
  await open(admin, '/agent-platform');
  await expect(
    admin.getByRole('heading', { level: 1, name: 'Agent Platform' }),
  ).toBeVisible();
  const tabs = admin.getByRole('tablist', { name: 'Toolbar tabs' }).first();
  await expect(tabs.getByRole('tab')).toHaveText([...agentPlatformTabs]);

  for (const name of agentPlatformTabs) {
    await tabs.getByRole('tab', { name }).click();
    await expect(tabs.getByRole('tab', { name })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  }
});

test.describe('second-level tabs', () => {
  const subTabs = {
    '/agent-platform/models': [
      'Model configs',
      'Serving',
      'GPU capacity',
    ] as const,
    '/agent-platform/usage': [
      'Overview',
      'Cost',
      'Your sessions',
      'MCP tools',
    ] as const,
    '/agent-platform/muster': [
      'Dashboard',
      'Servers',
      'Workflows',
      'Tool explorer',
    ] as const,
  };

  for (const [path, names] of Object.entries(subTabs)) {
    test(`${path} carries ${names.join(' · ')} and each renders on click`, async ({
      admin,
    }) => {
      await open(admin, path);
      const row = admin.getByRole('tablist', { name: 'Toolbar tabs' }).nth(1);
      await expect(row.getByRole('tab')).toHaveText([...names]);
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
  }
});

test('the Giant Swarm pages the lab enables render their headers', async ({
  admin,
}) => {
  for (const [path, heading] of [
    ['/catalog', 'Catalog'],
    ['/clusters', 'Clusters'],
    ['/deployments', 'Deployments'],
  ] as const) {
    await open(admin, path);
    await expect(
      admin.getByRole('heading', { level: 1, name: heading }),
    ).toBeVisible();
  }
});

test('Settings offers its three tabs', async ({ admin }) => {
  await open(admin, '/settings');
  await expect(
    admin.getByRole('tablist', { name: 'Toolbar tabs' }).getByRole('tab'),
  ).toHaveText(['General', 'Authentication Providers', 'Feature Flags']);
});

test('an unknown route renders the not-found page inside the chrome', async ({
  admin,
}) => {
  await open(admin, '/this-page-does-not-exist');
  await expect(admin.getByText(/not found/i).first()).toBeVisible();
});
