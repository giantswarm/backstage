import type { Page } from '@playwright/test';
import { expect, open, test } from './fixtures';

/**
 * The Agent Platform in the agent shell, on a lab serving both portals
 * (`AGENTLAB_PORTAL_MODE=shell`): its routes (`/`, `/sessions`, `/usage`,
 * `/profile`, `/customize/**`) render in the shell and never in classic
 * chrome, the shell's rail reaches its sections, and the
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
    '/',
    '/sessions',
    '/usage',
    '/profile',
    '/customize',
    '/customize/agents',
    '/customize/skills',
    '/customize/connectors',
    '/customize/models',
    '/customize/models/hosting',
    '/customize/workflows',
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

test('the rail reaches the shell’s sections', async ({ admin }) => {
  await open(admin, '/sessions');
  const nav = rail(admin);
  // The expanded rail: its items, Search (a button: the command palette)
  // after New session, and the recent sessions under them with the link to
  // them all (the phone's bar has a Sessions item instead,
  // `mobile-navigation.spec.ts`).
  for (const [name, href] of [
    ['New session', '/'],
    ['Customize', '/customize'],
    ['Usage', '/usage'],
    ['All sessions', '/sessions'],
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

/**
 * What the rail keeps in the browser: its width (the app's
 * `RAIL_WIDTH_STORAGE_KEY`) and core-components' pin state. `admin` is the
 * worker's page, whose storage outlives a test.
 */
const RAIL_STORAGE_KEYS = ['agentShell.railWidth', 'sidebarPinState'];

async function resetRail(page: Page) {
  await page
    .evaluate(keys => {
      for (const key of keys) {
        window.localStorage.removeItem(key);
      }
    }, RAIL_STORAGE_KEYS)
    .catch(() => undefined);
}

test.describe('the rail', () => {
  // Each test starts on the default rail, and a test that fails halfway does
  // not leave a resized or collapsed rail to the tests after it.
  test.beforeEach(async ({ admin }) => {
    await resetRail(admin);
  });
  test.afterEach(async ({ admin }) => {
    await resetRail(admin);
  });

  test('resizes from its edge, remembers the width, and the page follows', async ({
    admin,
  }) => {
    await open(admin, '/sessions');
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
    expect(initial, 'the default width, RAIL_DEFAULT_WIDTH').toBe(224);
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

    // Home is the narrowest, the default.
    await handle.focus();
    await admin.keyboard.press('Home');
    await expect.poll(navWidth).toBe(initial);
    await expect.poll(contentLeft).toBe(initial);
  });

  test('collapses narrow, with every icon on one vertical axis', async ({
    admin,
  }) => {
    await open(admin, '/sessions');
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
  });
});

test('the shell and the classic portal cross-link in new tabs', async ({
  admin,
}) => {
  await open(admin, '/sessions');
  const portal = rail(admin).getByRole('link', { name: 'Platform Portal' });
  await expect(portal).toHaveAttribute('href', '/clusters');
  await expect(portal).toHaveAttribute('target', '_blank');

  await open(admin, '/clusters');
  const sidebar = admin.getByRole('navigation', { name: 'sidebar nav' });
  const agentPlatform = sidebar.getByRole('link', { name: 'Agent Platform' });
  // The Agent Platform's address is the shell's home, the new-session screen.
  await expect(agentPlatform).toHaveAttribute('href', '/');
  await expect(agentPlatform).toHaveAttribute('target', '_blank');
});

test('/usage carries Overview · Cost · Your sessions · Connectors and each renders on click', async ({
  admin,
}) => {
  // The PO's order (T90): Connectors last. It is offered where the muster
  // plugin contributes it, which the lab registers.
  const names = ['Overview', 'Cost', 'Your sessions', 'Connectors'];
  await open(admin, '/usage');
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
