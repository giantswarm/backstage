import { expect, open, test } from './fixtures';
import { lab } from './lab';

/**
 * Every page of the classic portal the lab offers renders its chrome and its
 * own controls: the sidebar and the Giant Swarm pages the lab enables. A
 * broken bundle or a route that lost its page fails here before any deeper
 * spec runs. The Agent Platform is not part of the classic portal: in
 * `classic` mode nothing of it shows, in `shell` mode the sidebar only links
 * into the shell (`agent-platform-navigation.spec.ts` covers the shell).
 */

test('the sidebar links to every enabled page', async ({ admin }) => {
  // A classic page: on a lab serving the shell, `/` is the shell's.
  await open(admin, '/catalog');
  const nav = admin.getByRole('navigation', { name: 'sidebar nav' });
  for (const [name, href] of [
    ['Catalog', '/catalog'],
    ['Docs', '/docs'],
    ['Deployments', '/deployments'],
    ['Clusters', '/clusters'],
    ['Create...', '/create'],
    ['Settings', '/settings'],
  ] as const) {
    await expect(nav.getByRole('link', { name })).toHaveAttribute('href', href);
  }
  // The ai-chat drawer is enabled (app-config `api:ai-chat/drawer`), so the
  // classic sidebar's AI Assistant toggles it: a button, not a link.
  await expect(nav.getByRole('button', { name: 'AI Assistant' })).toBeVisible();
  // The lab configures a main auth provider, so cluster access is offered.
  await expect(
    nav.getByRole('button', { name: 'Cluster access' }),
  ).toBeVisible();
});

test('the sidebar carries the Agent Platform only as a link into the shell', async ({
  admin,
}) => {
  await open(admin, '/clusters');
  const nav = admin.getByRole('navigation', { name: 'sidebar nav' });
  const agentPlatform = nav.getByRole('link', { name: 'Agent Platform' });
  if (lab.portalMode === 'classic') {
    await expect(
      nav.getByText('Agent Platform'),
      'the classic portal shows nothing of the Agent Platform',
    ).toHaveCount(0);
    return;
  }
  await expect(agentPlatform).toHaveAttribute('href', '/agent-platform');
  await expect(agentPlatform, 'opens the shell in a new tab').toHaveAttribute(
    'target',
    '_blank',
  );
});

test('the classic portal routes no Agent Platform page', async ({ admin }) => {
  test.skip(
    lab.portalMode !== 'classic',
    'with the shell served, `/agent-platform/**` is the shell (agent-platform-navigation.spec.ts)',
  );
  for (const path of [
    '/agent-platform',
    '/agent-platform/agents',
    '/agent-platform/connectors',
    '/agent-platform/mcp-servers',
    '/agent-platform/skills',
    '/agent-platform/profile',
    '/customize',
  ]) {
    await open(admin, path);
    await expect(
      admin.getByText(/not found/i).first(),
      `${path} is not routed`,
    ).toBeVisible();
    await expect(
      admin.getByRole('navigation', { name: 'sidebar nav' }),
      `${path} keeps the classic chrome`,
    ).toBeAttached();
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
