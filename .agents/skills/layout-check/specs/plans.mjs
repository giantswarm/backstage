/*
 * Hive's pages of the plans plugin (Now, History, Plans with a plan's
 * review, Knowledge), in any of fixture mode's scenarios. Hive is off in
 * plain fixture mode: turn it on as fixture mode starts.
 *
 *   yarn fixtures start --enable page:plans --enable api:plans
 *   node .agents/skills/layout-check/layout-check.mjs --spec .agents/skills/layout-check/specs/plans.mjs
 *
 * A page whose record or control a scenario lacks (nothing to open in
 * `empty`, `loading` or `error`) is skipped, not failed. Hive's Roadmap tab
 * is the roadmap plugin's.
 */

/** Whether `locator` shows up within `ms`. */
const shows = (locator, ms = 5000) =>
  locator
    .first()
    .waitFor({ timeout: ms })
    .then(
      () => true,
      () => false,
    );

/** Presses every "Show all" of Now's lanes, so each lists all its cards. */
const everyLaneOpen = {
  name: 'every lane open',
  run: async ({ page, skip }) => {
    const more = page.getByRole('button', { name: /^Show all/ });
    if (!(await shows(more))) skip('no lane has more cards than it shows');
    while ((await more.count()) > 0) {
      await more.first().click();
    }
  },
};

/** Selects the Plans page's Merged tab and its first plan. */
const mergedTab = [
  {
    name: 'Merged',
    run: async ({ page, skip }) => {
      const tab = page.getByRole('tab', { name: 'Merged' });
      if (!(await shows(tab))) skip('no Merged tab: no plans repository');
      await tab.click();
    },
  },
  {
    // The first plan is selected as the tab opens: open the second.
    name: 'another plan open',
    run: async ({ page, skip }) => {
      const plans = page
        .getByRole('grid', { name: 'Merged plans' })
        .getByRole('row');
      if (!(await shows(plans)) || (await plans.count()) < 2) {
        skip('fewer than two merged plans');
      }
      const plan = plans.nth(1);
      await plan.click({ position: { x: 8, y: 8 } });
      if ((await plan.getAttribute('aria-selected')) !== 'true') {
        throw new Error('the second merged plan did not open');
      }
    },
  },
];

/** Opens the first proposed plan's review page from the list. */
const openFirstPull = async ({ page, skip }) => {
  const link = page.locator('a[href*="/hive/plans/pr/"]');
  if (!(await shows(link))) skip('no proposed plan to open');
  const href = await link.first().getAttribute('href');
  await page.goto(new URL(href, page.url()).href);
};

export default [
  { name: 'Now', path: '/hive/now', states: [everyLaneOpen] },
  { name: 'History', path: '/hive/history' },
  { name: 'Plans', path: '/hive/plans', states: mergedTab },
  // All teams: a repository picker in the header where there are several.
  { name: 'Plans · all teams', path: '/hive/plans?team=all' },
  { name: 'Plan review', path: '/hive/plans', setup: openFirstPull },
  { name: 'Knowledge', path: '/hive/knowledge' },
];
