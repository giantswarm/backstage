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

test('the rail resizes from its edge, remembers the width, and the page follows', async ({
  admin,
}) => {
  await open(admin, '/agent-platform/sessions');
  const nav = rail(admin);
  const handle = admin.getByRole('separator', {
    name: 'Resize sidebar',
    exact: true,
  });
  const content = admin.locator('#content');
  const navWidth = async () => (await nav.boundingBox())?.width;
  const contentLeft = async () => (await content.boundingBox())?.x;

  const initial = await navWidth();
  const grip = await handle.boundingBox();
  expect(initial).toBeDefined();
  expect(grip).not.toBeNull();
  const x = grip!.x + grip!.width / 2;
  const y = grip!.y + grip!.height / 2;
  await admin.mouse.move(x, y);
  await admin.mouse.down();
  await admin.mouse.move(x + 100, y, { steps: 5 });
  await admin.mouse.up();
  await expect.poll(navWidth).toBe(initial! + 100);
  await expect
    .poll(contentLeft, 'the page starts at the rail')
    .toBe(initial! + 100);

  await admin.reload();
  await expect
    .poll(navWidth, 'remembered across a reload')
    .toBe(initial! + 100);

  // Home is the narrowest, the default; it also leaves the next test there.
  await handle.focus();
  await admin.keyboard.press('Home');
  await expect.poll(navWidth).toBe(initial);
  await expect.poll(contentLeft).toBe(initial);
});

test('the collapsed rail is narrow, with every icon on one vertical axis', async ({
  admin,
}) => {
  await open(admin, '/agent-platform/sessions');
  const nav = rail(admin);
  await nav.getByRole('button', { name: 'Collapse sidebar' }).click();
  const expand = nav.getByRole('button', { name: 'Expand sidebar' });
  await expect(expand).toBeVisible();

  // RAIL_COLLAPSED_WIDTH: one 36px icon item, 8px either side, the border.
  await expect.poll(async () => (await nav.boundingBox())?.width).toBe(53);
  await expect
    .poll(async () => (await admin.locator('#content').boundingBox())?.x)
    .toBe(53);
  await expect(admin.getByRole('separator')).toHaveCount(0);

  // The axis is the rail's inner width's middle, left of the 1px border.
  const box = (await nav.boundingBox())!;
  const axis = box.x + (box.width - 1) / 2;
  // The logo, the expand button and every item's icon are SVGs; the profile
  // trigger holds an avatar instead.
  const marks = [
    ...(await nav.locator('svg').all()),
    nav.getByRole('button', { name: 'Profile and settings' }),
  ];
  expect(marks.length).toBeGreaterThan(4);
  for (const mark of marks) {
    const markBox = (await mark.boundingBox())!;
    expect(
      Math.abs(markBox.x + markBox.width / 2 - axis),
      await mark.evaluate(element => element.outerHTML.slice(0, 120)),
    ).toBeLessThanOrEqual(1);
  }

  // Pinned again, so the next test finds the expanded rail.
  await expand.click();
  await expect(
    nav.getByRole('button', { name: 'Collapse sidebar' }),
  ).toBeVisible();
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
