/*
 * Hive's pages of the plans plugin (Now, History, Plans with a plan's
 * review, Knowledge), in any of fixture mode's scenarios. Hive is off in
 * plain fixture mode: start it with the plans config next to this spec.
 *
 *   yarn fixtures start --config .agents/skills/layout-check/specs/plans.app-config.yaml
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
    name: 'first plan open',
    run: async ({ page, skip }) => {
      const plan = page.getByRole('tabpanel').getByRole('link').first();
      const button = page.getByRole('tabpanel').getByRole('button').first();
      if (await shows(plan, 2000)) {
        await plan.click();
      } else if (await shows(button, 2000)) {
        await button.click();
      } else {
        skip('no merged plan to open');
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
