import type { Locator, Page } from '@playwright/test';
import {
  expect,
  expectClearOfBottomBar,
  expectNoHorizontalScroll,
  open,
  test,
} from './fixtures';

/**
 * The Agent Platform on a phone (375×812, touch; the `agentlab-mobile`
 * project): the bottom bar's five items and the Profile menu that holds the
 * rest (T22 D1), the scrolling tab strips with their edge fades and an
 * underline that stays under the selected tab (T72), and no sideways page
 * scroll on the pages a person reads on a phone.
 */

const bar = (page: Page) =>
  page.getByRole('navigation', { name: 'Main', exact: true });

test('the bottom bar holds New session · Sessions · Search · Customize · Profile, each reaching its page', async ({
  admin,
}) => {
  await open(admin, '/sessions');
  const nav = bar(admin);
  await expect(nav).toHaveClass(/agent-shell-mobile-bar/);
  // Profile's item carries the person's avatar (an initial) before its label.
  await expect(nav.getByRole('listitem')).toHaveText([
    'New session',
    'Sessions',
    'Search',
    'Customize',
    /Profile$/,
  ]);
  // The bar spans the bottom of the screen, its items tappable.
  const box = await nav.boundingBox();
  expect(box!.y + box!.height).toBeCloseTo(812, 0);
  for (const item of await nav.getByRole('listitem').all()) {
    const itemBox = await item.boundingBox();
    expect(itemBox!.height, 'a 44px touch target').toBeGreaterThanOrEqual(44);
  }

  await nav.getByRole('link', { name: 'Customize' }).click();
  await expect(admin).toHaveURL(/\/customize(\/agents)?$/);
  await expect(
    admin.getByRole('heading', { level: 1, name: 'Customize' }),
  ).toBeVisible();

  await nav.getByRole('link', { name: 'Sessions' }).click();
  await expect(admin).toHaveURL(/\/sessions$/);
  await expect(
    admin.getByRole('heading', { level: 1, name: 'Sessions' }),
  ).toBeVisible();

  await nav.getByRole('button', { name: 'Search' }).click();
  const palette = admin.getByRole('dialog');
  await expect(palette).toBeVisible();
  await admin.keyboard.press('Escape');
  await expect(palette).toBeHidden();

  await nav.getByRole('link', { name: 'New session' }).click();
  await expect(admin).toHaveURL(/\/$/);
  await expect(admin.getByRole('textbox', { name: 'Prompt' })).toBeVisible();
});

test('the Profile menu carries Usage and the Platform Portal on a phone', async ({
  admin,
}) => {
  await open(admin, '/sessions');
  await bar(admin)
    .getByRole('button', { name: 'Profile and settings' })
    .click();
  const menu = admin.getByRole('menu');
  await expect(menu.getByRole('menuitem', { name: 'Usage' })).toBeVisible();
  await expect(
    menu.getByRole('menuitem', { name: 'Platform Portal' }),
  ).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Sign out' })).toBeVisible();
  await menu.getByRole('menuitem', { name: 'Usage' }).click();
  await expect(admin).toHaveURL(/\/usage/);
  await expect(
    admin.getByRole('heading', { level: 1, name: 'Usage' }),
  ).toBeVisible();
});

/** The phone tab strip around `tablist`: RouteTabs' scroll container. */
function stripOf(tablist: Locator): Locator {
  return tablist.locator('xpath=ancestor::div[contains(@class,"bui-Tabs")]/..');
}

/**
 * The selected tab's underline sits under the selected tab: bui's active
 * indicator box spans the tab's own box, horizontally, wherever the strip is
 * scrolled.
 */
async function expectUnderlineUnderSelected(tablist: Locator, what: string) {
  await expect
    .poll(
      () =>
        tablist.evaluate(list => {
          const tabs = list.closest('.bui-Tabs') as HTMLElement | null;
          const selected = list.querySelector('[aria-selected="true"]');
          if (!tabs || !selected) {
            return 'no selected tab';
          }
          const style = getComputedStyle(tabs);
          const left = parseFloat(style.getPropertyValue('--active-tab-left'));
          const width = parseFloat(
            style.getPropertyValue('--active-tab-width'),
          );
          const tabsBox = tabs.getBoundingClientRect();
          const tabBox = selected.getBoundingClientRect();
          const offset = tabBox.left - tabsBox.left;
          return Math.abs(left - offset) <= 1 &&
            Math.abs(width - tabBox.width) <= 1
            ? 'under'
            : `indicator ${left}+${width}, tab ${offset}+${tabBox.width}`;
        }),
      { message: `${what}: the underline is under the selected tab` },
    )
    .toBe('under');
}

test('Customize’s tab strip scrolls sideways with fades, the underline under the selected tab, and the page never scrolls sideways', async ({
  admin,
}) => {
  await open(admin, '/customize/agents');
  const tablist = admin.getByRole('main').getByRole('tablist').first();
  await expect(tablist.getByRole('tab')).toHaveCount(6);
  // The counts arrive with the data: measured before them, the six bare
  // labels can just fit.
  for (const tab of await tablist.getByRole('tab').all()) {
    await expect(tab).toHaveText(/\(\d+\)$/, { timeout: 60_000 });
  }
  const strip = stripOf(tablist);

  const geometry = () =>
    strip.evaluate(el => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      scrollLeft: el.scrollLeft,
      overflowX: getComputedStyle(el).overflowX,
      start: el.hasAttribute('data-overflow-start'),
      end: el.hasAttribute('data-overflow-end'),
      mask:
        getComputedStyle(el).maskImage ||
        getComputedStyle(el).getPropertyValue('-webkit-mask-image'),
    }));

  const first = await geometry();
  expect(first.overflowX, 'the strip scrolls on its own').toBe('auto');
  expect(
    first.scrollWidth,
    'six tabs with counts are wider than a phone',
  ).toBeGreaterThan(first.clientWidth);
  expect(first.start, 'nothing before the first tab').toBe(false);
  expect(first.end, 'more tabs after the visible ones').toBe(true);
  expect(first.mask, 'the end fades out').toContain('linear-gradient');
  await expectUnderlineUnderSelected(tablist, 'Agents');
  await expectNoHorizontalScroll(admin, 'Customize · Agents');

  // A tab off the end: selecting it scrolls the strip, not the page, and the
  // underline follows it there.
  await tablist.getByRole('tab', { name: /^Workflows/ }).click();
  await expect(admin).toHaveURL(/\/customize\/workflows/);
  await expect(
    tablist.getByRole('tab', { name: /^Workflows/ }),
  ).toHaveAttribute('aria-selected', 'true');
  await expect
    .poll(async () => (await geometry()).scrollLeft, {
      message: 'the strip scrolled the selected tab into view',
    })
    .toBeGreaterThan(0);
  const scrolled = await geometry();
  expect(scrolled.start, 'tabs before the visible ones fade in').toBe(true);
  await expect(tablist.getByRole('tab', { name: /^Workflows/ })).toBeInViewport(
    { ratio: 1 },
  );
  await expectUnderlineUnderSelected(tablist, 'Workflows, scrolled');
  await expectNoHorizontalScroll(admin, 'Customize · Workflows');

  // Swiping the strip back leaves the underline where the tab is.
  await strip.evaluate(el => el.scrollTo({ left: 0 }));
  await expect.poll(async () => (await geometry()).scrollLeft).toBe(0);
  await expectUnderlineUnderSelected(tablist, 'Workflows, strip scrolled back');

  for (const tab of [
    'skills',
    'connectors',
    'connectors/infrastructure',
    'connectors/internal',
    'models',
    'workspaces',
  ]) {
    await open(admin, `/customize/${tab}`);
    await expectNoHorizontalScroll(admin, `Customize · ${tab}`);
  }
});

test('Usage’s tabs and pages fit a phone', async ({ admin }) => {
  await open(admin, '/usage');
  const tablist = admin.getByRole('main').getByRole('tablist').first();
  // The PO's order (T90), Connectors last.
  const names = ['Overview', 'Cost', 'Your sessions', 'Connectors'];
  await expect(tablist.getByRole('tab')).toHaveText(names);
  for (const name of names) {
    const tab = tablist.getByRole('tab', { name });
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    await expect(tab).toBeInViewport({ ratio: 1 });
    await expectUnderlineUnderSelected(tablist, `Usage · ${name}`);
    await expectNoHorizontalScroll(admin, `Usage · ${name}`);
  }
});

test('an agent’s page fits a phone, its actions clear of the bar', async ({
  admin,
  labAgent,
}) => {
  await open(admin, labAgent.detailPath);
  await expect(
    admin.getByRole('heading', { level: 1, name: labAgent.name }),
  ).toBeVisible();
  await expectNoHorizontalScroll(admin, 'agent detail');
  const tablist = admin.getByRole('main').getByRole('tablist').first();
  for (const tab of await tablist.getByRole('tab').all()) {
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    await expectNoHorizontalScroll(
      admin,
      `agent detail · ${await tab.innerText()}`,
    );
  }
  await expectClearOfBottomBar(
    admin,
    admin.getByRole('button', { name: 'Agent actions' }),
    'the agent’s ⋯ menu',
  );
});

test('the hosting pages and Sessions fit a phone', async ({ admin }) => {
  for (const path of [
    '/sessions',
    '/customize/models/hosting',
    '/customize/models/hosting/capacity',
    '/customize/models/hosting/cache',
    '/profile',
  ]) {
    await open(admin, path);
    await expect(admin.getByRole('heading', { level: 1 })).toBeVisible();
    await expectNoHorizontalScroll(admin, path);
  }
});
